import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import MatchupBuilder from './components/matchup/MatchupBuilder'
import BehaviorPredictionPanel from './components/panel/BehaviorPredictionPanel'
import SimulationPanel from './components/panel/SimulationPanel'
import ZoneDetailPanel from './components/panel/ZoneDetailPanel'
import PitchBreakdownChart from './components/zone/PitchBreakdownChart'
import type { PitchFilter } from './components/zone/PitchBreakdownChart'
import type { Player } from './domain/models/player'
import type { PitchType } from './domain/models/pitch'
import type { ZoneId, ZoneProbability } from './domain/models/zone'
import { zoneLabels } from './domain/models/zone'
import { buildPredictedMatchupModel } from './domain/services/behaviorPredictor'
import { mergeBaseballSavantDatasets, parseBaseballSavantCsv } from './domain/services/baseballSavantParser'
import type { BaseballSavantDataset } from './domain/services/baseballSavantParser'
import { runMonteCarloSimulation } from './domain/services/monteCarloSimulator'

const generatedDataModules = import.meta.glob('./data/generated*.json', {
  eager: true,
  import: 'default'
}) as Record<string, unknown>

const simulationIterations = 10000
const minLeftPanelWidth = 240
const maxLeftPanelWidth = 460
const minRightPanelWidth = 340
const maxRightPanelWidth = 620

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

const isPlayer = (value: unknown): value is Player => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<Player>

  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && Boolean(candidate.role)
}

const extractGeneratedPlayers = (role: Player['role']): Player[] => {
  return Object.values(generatedDataModules).flatMap((module) => {
    if (Array.isArray(module)) {
      return module.filter((item): item is Player => isPlayer(item) && item.role === role)
    }

    if (!module || typeof module !== 'object') {
      return []
    }

    const record = module as Record<string, unknown>
    const key = role === 'pitcher' ? 'pitchers' : 'batters'
    const players = record[key]

    return Array.isArray(players) ? players.filter((item): item is Player => isPlayer(item) && item.role === role) : []
  })
}

const getPlayers = (role: Player['role']): Player[] => {
  return extractGeneratedPlayers(role)
}

const getUniquePitchTypes = (zones: ZoneProbability[], pitcher: Player | null): PitchType[] => {
  const recordedPitchTypes = Array.from(new Set(zones.map((zone) => zone.pitchType)))
  const arsenal = pitcher?.pitchArsenal ?? []

  if (recordedPitchTypes.length === 0) {
    return arsenal.length > 0 ? arsenal : ['FF']
  }

  if (arsenal.length === 0) {
    return recordedPitchTypes
  }

  const arsenalWithData = arsenal.filter((pitchType) => recordedPitchTypes.includes(pitchType))

  return arsenalWithData.length > 0 ? arsenalWithData : arsenal
}

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const clampProbability = (value: number): number => Math.min(Math.max(value, 0), 1)

const applyBatterAdjustments = (zones: ZoneProbability[], batter: Player | null): ZoneProbability[] => {
  if (!batter) {
    return zones
  }

  return zones.map((zone) => {
    const strongZoneBoost = batter.strongZones?.includes(zone.zoneId) ? 1.12 : 1
    const weakZonePenalty = batter.weakZones?.includes(zone.zoneId) ? 0.88 : 1
    const weakPitchPenalty = batter.weakPitchTypes?.includes(zone.pitchType) ? 0.9 : 1
    const aggressionBoost = 1 + ((batter.aggressionScore ?? 50) - 50) / 500
    const disciplineBoost = 1 + ((batter.disciplineScore ?? 50) - 50) / 700
    const hitMultiplier = strongZoneBoost * weakZonePenalty * weakPitchPenalty

    return {
      ...zone,
      hitProbability: clampProbability(zone.hitProbability * hitMultiplier),
      homeRunProbability: clampProbability(zone.homeRunProbability * strongZoneBoost * weakZonePenalty),
      swingProbability: clampProbability(zone.swingProbability * aggressionBoost),
      whiffProbability: clampProbability(zone.whiffProbability * weakPitchPenalty),
      riskValue: Math.round(zone.riskValue * strongZoneBoost * disciplineBoost),
      pressureValue: Math.round(zone.pressureValue * weakZonePenalty * weakPitchPenalty)
    }
  })
}

const aggregateZone = (
  zones: ZoneProbability[],
  zoneId: ZoneId,
  pitchFilter: PitchFilter,
  fallbackPitchType: PitchType
): ZoneProbability | null => {
  const matches = zones.filter((zone) => {
    return zone.zoneId === zoneId && (pitchFilter === 'ALL' || zone.pitchType === pitchFilter)
  })

  if (matches.length === 0) {
    return null
  }

  const hasObserved = matches.some((zone) => zone.dataQuality === 'observed')
  const hasPredicted = matches.some((zone) => zone.dataQuality === 'predicted')

  return {
    count: matches[0].count,
    pitchType: pitchFilter === 'ALL' ? fallbackPitchType : pitchFilter,
    zoneId,
    pitchProbability: average(matches.map((zone) => zone.pitchProbability)),
    battingAverage: average(matches.map((zone) => zone.battingAverage)),
    hitProbability: average(matches.map((zone) => zone.hitProbability)),
    homeRunProbability: average(matches.map((zone) => zone.homeRunProbability)),
    swingProbability: average(matches.map((zone) => zone.swingProbability)),
    whiffProbability: average(matches.map((zone) => zone.whiffProbability)),
    pressureValue: Math.round(average(matches.map((zone) => zone.pressureValue))),
    riskValue: Math.round(average(matches.map((zone) => zone.riskValue))),
    dataQuality: hasObserved && hasPredicted ? 'mixed' : hasObserved ? 'observed' : 'predicted'
  }
}

const getRecommendedZone = (zones: ZoneProbability[]): ZoneProbability | null => {
  if (zones.length === 0) {
    return null
  }

  return [...zones].sort((first, second) => {
    const firstScore = first.pitchProbability * 70 + first.pressureValue / 100 - first.riskValue / 120
    const secondScore = second.pitchProbability * 70 + second.pressureValue / 100 - second.riskValue / 120

    return secondScore - firstScore
  })[0]
}

function App(): React.JSX.Element {
  const [selectedPitcherId, setSelectedPitcherId] = useState<string | null>(null)
  const [selectedBatterId, setSelectedBatterId] = useState<string | null>(null)
  const [selectedPitchType, setSelectedPitchType] = useState<PitchFilter>('ALL')
  const [selectedZoneId, setSelectedZoneId] = useState<ZoneId>('middle-middle')
  const [savantDataset, setSavantDataset] = useState<BaseballSavantDataset | null>(null)
  const [savantStatus, setSavantStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading')
  const [savantMessage, setSavantMessage] = useState('Baseball Savant 데이터를 자동으로 불러오는 중입니다.')
  const [layoutWidths, setLayoutWidths] = useState({ left: 300, right: 420 })
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const didRequestInitialData = useRef(false)

  const generatedPitchers = useMemo(() => getPlayers('pitcher'), [])
  const generatedBatters = useMemo(() => getPlayers('batter'), [])
  const pitchers = savantDataset?.pitchers.length ? savantDataset.pitchers : generatedPitchers
  const batters = savantDataset?.batters.length ? savantDataset.batters : generatedBatters
  const selectedPitcher = pitchers.find((pitcher) => pitcher.id === selectedPitcherId) ?? pitchers[0] ?? null
  const selectedBatter = batters.find((batter) => batter.id === selectedBatterId) ?? batters[0] ?? null

  const allZones = useMemo<ZoneProbability[]>(() => {
    return savantDataset?.zones ?? []
  }, [savantDataset])

  const loadBaseballSavantData = useCallback(async (): Promise<void> => {
    setSavantStatus('loading')
    setSavantMessage('Baseball Savant 데이터를 불러오는 중입니다.')

    try {
      const [pitcherCsv, batterCsv] = await Promise.all([
        window.api.fetchBaseballSavantCsv({ playerType: 'pitcher' }),
        window.api.fetchBaseballSavantCsv({ playerType: 'batter' })
      ])
      const pitcherDataset = parseBaseballSavantCsv(pitcherCsv, 'pitcher')
      const batterDataset = parseBaseballSavantCsv(batterCsv, 'batter')
      const mergedPlayers = mergeBaseballSavantDatasets(pitcherDataset, batterDataset)
      const dataset: BaseballSavantDataset = {
        pitchers: pitcherDataset.pitchers,
        batters: mergedPlayers.batters,
        zones: pitcherDataset.zones,
        rowCount: pitcherDataset.rowCount
      }

      if (dataset.pitchers.length === 0 || dataset.batters.length === 0 || dataset.zones.length === 0) {
        throw new Error('분석 가능한 실제 투구 데이터가 부족합니다.')
      }

      setSavantDataset(dataset)
      setSelectedPitcherId(dataset.pitchers[0]?.id ?? null)
      setSelectedBatterId(dataset.batters[0]?.id ?? null)
      setSelectedPitchType('ALL')
      setSavantStatus('ready')
      setSavantMessage(`Baseball Savant ${dataset.rowCount.toLocaleString()}개 투구 데이터를 반영했습니다.`)
    } catch (error) {
      setSavantStatus('error')
      setSavantMessage(error instanceof Error ? error.message : 'Baseball Savant 데이터를 불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => {
    if (didRequestInitialData.current) {
      return
    }

    didRequestInitialData.current = true
    void loadBaseballSavantData()
  }, [loadBaseballSavantData])

  const rawPitcherZones = useMemo(() => {
    return allZones.filter((zone) => {
      const matchesPitcher = !zone.pitcherId || zone.pitcherId === selectedPitcher?.id

      return matchesPitcher
    })
  }, [allZones, selectedPitcher])

  const pitcherPitchTypes = useMemo(() => getUniquePitchTypes(rawPitcherZones, selectedPitcher), [rawPitcherZones, selectedPitcher])

  useEffect(() => {
    if (selectedPitchType !== 'ALL' && !pitcherPitchTypes.includes(selectedPitchType)) {
      setSelectedPitchType('ALL')
    }
  }, [pitcherPitchTypes, selectedPitchType])

  const observedPitcherZones = useMemo(() => {
    const baseZones = rawPitcherZones.filter((zone) => pitcherPitchTypes.includes(zone.pitchType))

    return applyBatterAdjustments(baseZones, selectedBatter)
  }, [pitcherPitchTypes, rawPitcherZones, selectedBatter])

  const predictedMatchup = useMemo(() => {
    return buildPredictedMatchupModel(observedPitcherZones, selectedPitcher, selectedBatter, pitcherPitchTypes)
  }, [observedPitcherZones, pitcherPitchTypes, selectedBatter, selectedPitcher])

  const analysisZones = predictedMatchup.zones
  const selectedPitchTypeForSimulation = selectedPitchType === 'ALL' ? pitcherPitchTypes[0] : selectedPitchType
  const selectedZone = aggregateZone(
    analysisZones,
    selectedZoneId,
    selectedPitchType,
    selectedPitchTypeForSimulation ?? 'FF'
  )
  const visibleZones = useMemo(() => {
    return selectedPitchType === 'ALL'
      ? analysisZones
      : analysisZones.filter((zone) => zone.pitchType === selectedPitchType)
  }, [analysisZones, selectedPitchType])
  const recommendedZone = getRecommendedZone(visibleZones)

  const simulationSummary = useMemo(() => {
    return runMonteCarloSimulation(analysisZones, selectedPitchTypeForSimulation ?? 'FF', simulationIterations)
  }, [analysisZones, selectedPitchTypeForSimulation])

  const startColumnResize = (target: 'left' | 'right', event: ReactPointerEvent<HTMLButtonElement>): void => {
    const layoutElement = layoutRef.current

    if (!layoutElement) {
      return
    }

    event.preventDefault()
    const rect = layoutElement.getBoundingClientRect()

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      setLayoutWidths((current) => {
        if (target === 'left') {
          return {
            ...current,
            left: clamp(moveEvent.clientX - rect.left, minLeftPanelWidth, maxLeftPanelWidth)
          }
        }

        return {
          ...current,
          right: clamp(rect.right - moveEvent.clientX, minRightPanelWidth, maxRightPanelWidth)
        }
      })
    }

    const stopResize = (): void => {
      document.body.classList.remove('is-resizing-layout')
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
    }

    document.body.classList.add('is-resizing-layout')
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-6 text-slate-100">
      <div className="app-shell">
        <header className="app-header">
          <div>
            <h1 className="text-3xl font-bold text-white">PlateMind</h1>
            <p className="mt-1 text-xl text-slate-300">
              {selectedPitcher?.name ?? '투수 미선택'} 대 {selectedBatter?.name ?? '타자 미선택'}
            </p>
          </div>
          <div className="header-summary">
            <span>{pitcherPitchTypes.length}개 구종</span>
            <span>{observedPitcherZones.length.toLocaleString()}개 관측 구역</span>
            <span>{predictedMatchup.predictedZoneCount.toLocaleString()}개 예측 보정</span>
            <span>{simulationIterations.toLocaleString()}회 시뮬레이션</span>
          </div>
        </header>

        <section className={`data-status-strip ${savantStatus}`}>
          <div>
            <strong>{savantStatus === 'ready' ? '실제 데이터 연결됨' : savantStatus === 'error' ? '데이터 보정 모드' : '데이터 로딩 중'}</strong>
            <span>{savantMessage}</span>
          </div>
          <button type="button" onClick={loadBaseballSavantData} disabled={savantStatus === 'loading'}>
            다시 불러오기
          </button>
        </section>

        <div
          className="analysis-layout resizable-analysis-layout"
          ref={layoutRef}
          style={{
            gridTemplateColumns: `${layoutWidths.left}px 10px minmax(480px, 1fr) 10px ${layoutWidths.right}px`
          }}
        >
          <MatchupBuilder
            pitchers={pitchers}
            batters={batters}
            selectedPitcher={selectedPitcher}
            selectedBatter={selectedBatter}
            savantStatus={savantStatus}
            savantMessage={savantMessage}
            onLoadBaseballSavant={loadBaseballSavantData}
            onSelectPitcher={(pitcher) => {
              setSelectedPitcherId(pitcher.id)
              setSelectedPitchType('ALL')
            }}
            onSelectBatter={(batter) => setSelectedBatterId(batter.id)}
          />

          <button
            aria-label="왼쪽 패널 크기 조절"
            className="column-resizer"
            type="button"
            onPointerDown={(event) => startColumnResize('left', event)}
          />

          <section className="breakdown-main">
            <PitchBreakdownChart
              zones={analysisZones}
              pitchTypes={pitcherPitchTypes}
              selectedPitchType={selectedPitchType}
              selectedZoneId={selectedZoneId}
              onSelectPitchType={setSelectedPitchType}
              onSelectZone={(zoneId, pitchType) => {
                setSelectedZoneId(zoneId)
                setSelectedPitchType(pitchType)
              }}
            />
          </section>

          <button
            aria-label="오른쪽 패널 크기 조절"
            className="column-resizer"
            type="button"
            onPointerDown={(event) => startColumnResize('right', event)}
          />

          <aside className="analysis-rail">
            <section className="recommendation-card">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">추천 구역</span>
              <p className="mt-2 text-sm text-slate-300">
                {recommendedZone
                  ? `${recommendedZone.pitchType} - ${zoneLabels[recommendedZone.zoneId]}`
                  : '추천 가능한 구역 데이터가 없습니다.'}
              </p>
              {recommendedZone ? (
                <div className="recommendation-metrics">
                  <span>압박 {recommendedZone.pressureValue}</span>
                  <span>위험 {recommendedZone.riskValue}</span>
                  <span>투구 {Math.round(recommendedZone.pitchProbability * 100)}%</span>
                </div>
              ) : null}
            </section>
            <SimulationPanel summary={simulationSummary} />
            <ZoneDetailPanel zone={selectedZone} />
            <BehaviorPredictionPanel
              pitcherBehavior={predictedMatchup.pitcherBehavior}
              batterBehavior={predictedMatchup.batterBehavior}
              observedZoneCount={predictedMatchup.observedZoneCount}
              predictedZoneCount={predictedMatchup.predictedZoneCount}
            />
          </aside>
        </div>

        <footer className="mvp-note">
          현재 화면은 Baseball Savant pitch-level 데이터를 우선 사용하고, 부족한 구간은 선수 행동 유형 예측으로 보정합니다. 예측 보정값은
          포트폴리오 MVP용 분석 모델이며 실제 경기 예측을 보장하지 않습니다.
        </footer>
      </div>
    </main>
  )
}

export default App
