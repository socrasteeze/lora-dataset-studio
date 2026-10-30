import SystemStatsReadout from './SystemStatsReadout'

export default function Readout({ surface }) {
  const canvas = surface === 'canvas'
  return <SystemStatsReadout
    testId={canvas ? 'canvas-system-stats' : 'header-system-stats'}
    helpTopic="canvas-machine-load" />
}
