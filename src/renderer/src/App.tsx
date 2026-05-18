import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import MatchupBuilder from './components/matchup/MatchupBuilder'
import BehaviorPredictionPanel from './components/panel/BehaviorPredictionPanel'
import SimulationPanel from './components/panel/SimulationPanel'
import ZoneDetailPanel from './components/panel/ZoneDetailPanel'
import PitchBreakdownChart from './components/zone/PitchBreakdownChart'
import type { PitchFilter, PitchMapMode, PitchMapSampleCount } from './components/zone/PitchBreakdownChart'
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

const getBatterSkill = (batter: Player): number => {
  const discipline = batter.disciplineScore ?? 50
  const aggression = batter.aggressionScore ?? 50
  const volume = Math.min(Math.log10((batter.pitchesSeen ?? batter.plateAppearances ?? 0) + 10) / 4, 1)
  const strengthBonus = (batter.strongZones?.length ?? 0) * 2
  const weaknessPenalty = (batter.weakZones?.length ?? 0) + (batter.weakPitchTypes?.length ?? 0) * 1.5
  const tagBonus = (batter.tags ?? []).some((tag) => ['Power', 'Contact', 'Patient'].includes(tag)) ? 3 : 0

  return Math.min(Math.max(discipline * 0.48 + aggression * 0.28 + volume * 18 + strengthBonus + tagBonus - weaknessPenalty, 20), 90)
}

const getPitcherCommand = (pitcher: Player | null): number => {
  if (!pitcher) {
    return 0.52
  }

  const velocity = pitcher.averageVelocity ? (pitcher.averageVelocity > 120 ? pitcher.averageVelocity / 1.609344 : pitcher.averageVelocity) : 91
  const arsenal = pitcher.pitchArsenal?.length ?? 2
  const volume = Math.min(Math.log10((pitcher.pitchCount ?? 0) + 10) / 4, 1)

  return Math.min(Math.max((velocity - 87) / 16 * 0.38 + Math.min(arsenal, 6) / 6 * 0.24 + volume * 0.38, 0.18), 0.92)
}

const applyBatterAdjustments = (zones: ZoneProbability[], batter: Player | null): ZoneProbability[] => {
  if (!batter) {
    return zones
  }

  const batterSkill = getBatterSkill(batter)
  const skillDelta = ((batterSkill - 55) / 100) * 2
  const disciplineDelta = ((batter.disciplineScore ?? 50) - 50) / 100
  const aggressionDelta = ((batter.aggressionScore ?? 50) - 50) / 100

  return zones.map((zone) => {
    const strongZoneBoost = batter.strongZones?.includes(zone.zoneId) ? 1.26 : 1
    const weakZonePenalty = batter.weakZones?.includes(zone.zoneId) ? 0.74 : 1
    const weakPitchPenalty = batter.weakPitchTypes?.includes(zone.pitchType) ? 0.78 : 1
    const aggressionBoost = 1 + aggressionDelta * 0.34
    const disciplineSwingAdjustment = 1 - disciplineDelta * 0.24
    const skillHitBoost = 1 + skillDelta * 0.72
    const skillWhiffPenalty = 1 - skillDelta * 0.86
    const hitMultiplier = strongZoneBoost * weakZonePenalty * weakPitchPenalty * skillHitBoost
    const swingMultiplier = Math.max(0.62, aggressionBoost * disciplineSwingAdjustment)

    return {
      ...zone,
      hitProbability: clampProbability(zone.hitProbability * hitMultiplier),
      battingAverage: clampProbability(zone.battingAverage * hitMultiplier),
      homeRunProbability: clampProbability(zone.homeRunProbability * strongZoneBoost * weakZonePenalty * (1 + aggressionDelta * 0.28)),
      swingProbability: clampProbability(zone.swingProbability * swingMultiplier),
      whiffProbability: clampProbability(zone.whiffProbability * weakPitchPenalty * Math.max(0.58, skillWhiffPenalty)),
      riskValue: Math.round(zone.riskValue * strongZoneBoost * (1 + skillDelta * 0.42)),
      pressureValue: Math.round(zone.pressureValue * weakZonePenalty * weakPitchPenalty * (1 - skillDelta * 0.34))
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
  const [analysisTab, setAnalysisTab] = useState<'simulation' | 'zone' | 'behavior'>('simulation')
  const [selectedPitchType, setSelectedPitchType] = useState<PitchFilter>('ALL')
  const [selectedZoneId, setSelectedZoneId] = useState<ZoneId>('middle-middle')
  const [pitchMapMode, setPitchMapMode] = useState<PitchMapMode>('pitchType')
  const [pitchMapSampleCount, setPitchMapSampleCount] = useState<PitchMapSampleCount>(100)
  const [pitchClusterRadius, setPitchClusterRadius] = useState(1.5)
  const [isMatchupRefreshing, setIsMatchupRefreshing] = useState(false)
  const [matchupSimulationVersion, setMatchupSimulationVersion] = useState(0)
  const [savantDataset, setSavantDataset] = useState<BaseballSavantDataset | null>(null)
  const [savantStatus, setSavantStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('loading')
  const [savantMessage, setSavantMessage] = useState('Baseball Savant 데이터를 자동으로 불러오는 중입니다.')
  const [layoutWidths, setLayoutWidths] = useState({ left: 300, right: 420 })
  const layoutRef = useRef<HTMLDivElement | null>(null)
  const didRequestInitialData = useRef(false)
  const matchupRefreshTimer = useRef<number | null>(null)

  const generatedPitchers = useMemo(() => getPlayers('pitcher'), [])
  const generatedBatters = useMemo(() => getPlayers('batter'), [])
  const pitchers = savantDataset?.pitchers.length ? savantDataset.pitchers : generatedPitchers
  const batters = savantDataset?.batters.length ? savantDataset.batters : generatedBatters
  const selectedPitcher = pitchers.find((pitcher) => pitcher.id === selectedPitcherId) ?? pitchers[0] ?? null
  const selectedBatter = batters.find((batter) => batter.id === selectedBatterId) ?? batters[0] ?? null
  const matchupKey = `${selectedPitcher?.id ?? 'none'}-${selectedBatter?.id ?? 'none'}`

  const allZones = useMemo<ZoneProbability[]>(() => {
    return savantDataset?.zones ?? []
  }, [savantDataset])

  const loadBaseballSavantData = useCallback(async (): Promise<void> => {
    setIsMatchupRefreshing(true)
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
      setSelectedZoneId('middle-middle')
      setMatchupSimulationVersion((version) => version + 1)
      setSavantStatus('ready')
      setSavantMessage(`Baseball Savant ${dataset.rowCount.toLocaleString()}개 투구 데이터를 반영했습니다.`)
      window.setTimeout(() => setIsMatchupRefreshing(false), 180)
    } catch (error) {
      setSavantStatus('error')
      setSavantMessage(error instanceof Error ? error.message : 'Baseball Savant 데이터를 불러오지 못했습니다.')
      setIsMatchupRefreshing(false)
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
    const pitcherZones = allZones.filter((zone) => {
      const matchesPitcher = !zone.pitcherId || zone.pitcherId === selectedPitcher?.id

      return matchesPitcher
    })
    const batterSpecificZones = selectedBatter
      ? pitcherZones.filter((zone) => !zone.batterId || zone.batterId === selectedBatter.id)
      : []

    return batterSpecificZones.length > 0 ? batterSpecificZones : pitcherZones
  }, [allZones, selectedBatter, selectedPitcher])

  const pitcherPitchTypes = useMemo(() => getUniquePitchTypes(rawPitcherZones, selectedPitcher), [rawPitcherZones, selectedPitcher])

  const activePitchType =
    selectedPitchType !== 'ALL' && !pitcherPitchTypes.includes(selectedPitchType) ? 'ALL' : selectedPitchType

  const observedPitcherZones = useMemo(() => {
    const baseZones = rawPitcherZones.filter((zone) => pitcherPitchTypes.includes(zone.pitchType))

    return applyBatterAdjustments(baseZones, selectedBatter)
  }, [pitcherPitchTypes, rawPitcherZones, selectedBatter])

  const predictedMatchup = useMemo(() => {
    return buildPredictedMatchupModel(observedPitcherZones, selectedPitcher, selectedBatter, pitcherPitchTypes)
  }, [observedPitcherZones, pitcherPitchTypes, selectedBatter, selectedPitcher])

  const analysisZones = predictedMatchup.zones
  const selectedPitchTypeForSimulation = activePitchType === 'ALL' ? pitcherPitchTypes[0] : activePitchType
  const selectedZone = aggregateZone(
    analysisZones,
    selectedZoneId,
    activePitchType,
    selectedPitchTypeForSimulation ?? 'FF'
  )
  const visibleZones = useMemo(() => {
    return activePitchType === 'ALL'
      ? analysisZones
      : analysisZones.filter((zone) => zone.pitchType === activePitchType)
  }, [activePitchType, analysisZones])
  const recommendedZone = getRecommendedZone(visibleZones)

  const simulationSummary = useMemo(() => {
    return runMonteCarloSimulation(analysisZones, selectedPitchTypeForSimulation ?? 'FF', simulationIterations, {
      pitcher: selectedPitcher,
      batter: selectedBatter
    })
  }, [analysisZones, matchupSimulationVersion, selectedBatter, selectedPitcher, selectedPitchTypeForSimulation])
  const pitcherCommand = useMemo(() => getPitcherCommand(selectedPitcher), [selectedPitcher])

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

  const markMatchupRefreshing = (): void => {
    setIsMatchupRefreshing(true)
    setMatchupSimulationVersion((version) => version + 1)

    if (matchupRefreshTimer.current !== null) {
      window.clearTimeout(matchupRefreshTimer.current)
    }

    matchupRefreshTimer.current = window.setTimeout(() => {
      setIsMatchupRefreshing(false)
      matchupRefreshTimer.current = null
    }, 180)
  }

  return (
    <main className="app-window min-h-screen bg-slate-950 text-slate-100">
      <div className="app-titlebar">
        <div className="app-titlebar-brand">
          <span className="app-titlebar-mark">PM</span>
          <span>PLATEMIND</span>
        </div>
        <div className="window-controls">
          <button aria-label="Minimize" type="button" onClick={() => window.api.minimizeWindow()}>
            <span />
          </button>
          <button aria-label="Maximize" type="button" onClick={() => window.api.toggleMaximizeWindow()}>
            <span />
          </button>
          <button aria-label="Close" className="window-control-close" type="button" onClick={() => window.api.closeWindow()}>
            <span />
          </button>
        </div>
      </div>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-main">
            <h1 className="text-3xl font-bold text-white">PLATEMIND</h1>
            <div className="header-matchup">
              <div className="header-matchup-player">
                <span>Pitcher</span>
                <strong>{selectedPitcher?.name ?? 'Not selected'}</strong>
              </div>
              <div className="header-matchup-vs">vs</div>
              <div className="header-matchup-player">
                <span>Batter</span>
                <strong>{selectedBatter?.name ?? 'Not selected'}</strong>
              </div>
            </div>
          </div>
          <div className="header-summary">
            <span>{pitcherPitchTypes.length}개 구종</span>
            <span>{observedPitcherZones.length.toLocaleString()}개 관측 구역</span>
            <span>{predictedMatchup.predictedZoneCount.toLocaleString()}개 예측 보정</span>
            <span>{simulationIterations.toLocaleString()}회 시뮬레이션</span>
          </div>
        </header>

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
              markMatchupRefreshing()
              setSelectedPitcherId(pitcher.id)
              setSelectedPitchType('ALL')
              setSelectedZoneId('middle-middle')
            }}
            onSelectBatter={(batter) => {
              markMatchupRefreshing()
              setSelectedBatterId(batter.id)
              setSelectedPitchType('ALL')
              setSelectedZoneId('middle-middle')
            }}
          />

          <button
            aria-label="왼쪽 패널 크기 조절"
            className="column-resizer"
            type="button"
            onPointerDown={(event) => startColumnResize('left', event)}
          />

          <section className="breakdown-main">
            {isMatchupRefreshing ? <div className="matchup-refresh-overlay">매치업 갱신 중</div> : null}
            <PitchBreakdownChart
              key={`${matchupKey}-${matchupSimulationVersion}`}
              zones={analysisZones}
              pitchTypes={pitcherPitchTypes}
              selectedPitchType={activePitchType}
              pitchMapMode={pitchMapMode}
              pitchMapSampleCount={pitchMapSampleCount}
              pitchClusterRadius={pitchClusterRadius}
              simulationVersion={matchupSimulationVersion}
              pitcherCommand={pitcherCommand}
              onSelectPitchType={setSelectedPitchType}
              onSelectZone={(zoneId, pitchType) => {
                setSelectedZoneId(zoneId)
                setSelectedPitchType(pitchType)
              }}
              onSelectPitchMapMode={setPitchMapMode}
              onSelectPitchMapSampleCount={setPitchMapSampleCount}
              onChangePitchClusterRadius={setPitchClusterRadius}
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
            <section className="analysis-tab-shell" key={matchupKey}>
              {isMatchupRefreshing ? <div className="panel-refresh-state">매치업 데이터를 다시 계산하고 있습니다.</div> : null}
              <div className="analysis-tab-list">
                <button
                  className={analysisTab === 'simulation' ? 'active' : ''}
                  type="button"
                  onClick={() => setAnalysisTab('simulation')}
                >
                  몬테카를로
                </button>
                <button
                  className={analysisTab === 'zone' ? 'active' : ''}
                  type="button"
                  onClick={() => setAnalysisTab('zone')}
                >
                  선택 구역
                </button>
                <button
                  className={analysisTab === 'behavior' ? 'active' : ''}
                  type="button"
                  onClick={() => setAnalysisTab('behavior')}
                >
                  행동 예측
                </button>
              </div>
              <div className="analysis-tab-panel">
                {analysisTab === 'simulation' ? <SimulationPanel summary={simulationSummary} /> : null}
                {analysisTab === 'zone' ? <ZoneDetailPanel zone={selectedZone} /> : null}
                {analysisTab === 'behavior' ? (
                  <BehaviorPredictionPanel
                    pitcherBehavior={predictedMatchup.pitcherBehavior}
                    batterBehavior={predictedMatchup.batterBehavior}
                    observedZoneCount={predictedMatchup.observedZoneCount}
                    predictedZoneCount={predictedMatchup.predictedZoneCount}
                  />
                ) : null}
              </div>
            </section>
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
