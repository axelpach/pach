import { startIntegrationSyncRunner } from './integration-sync/runner.js'
import { startMarketingAutomationRunner } from './marketing-automation/runner.js'
import { startTaskTriggerRunner } from './task-triggers/runner.js'

type AutomationRunnerDefinition = {
  id: string
  description: string
  env: string[]
  start: () => unknown
}

export const automationRunners: AutomationRunnerDefinition[] = [
  {
    id: 'task-triggers',
    description: 'Creates project issues from recurring task trigger schedules.',
    env: ['TASK_TRIGGER_RUNNER_DISABLED', 'TASK_TRIGGER_RUNNER_INTERVAL_MS'],
    start: startTaskTriggerRunner,
  },
  {
    id: 'marketing-automation',
    description: 'Runs due blog/newsletter sends and keeps marketing cadence slots moving.',
    env: ['MARKETING_AUTOMATION_RUNNER_DISABLED', 'MARKETING_SCHEDULE_RUNNER_INTERVAL_MS', 'MARKETING_CADENCE_RUNNER_INTERVAL_MS'],
    start: startMarketingAutomationRunner,
  },
  {
    id: 'integration-sync',
    description: 'Refreshes external integration data such as Google Search Console and Google Ads analytics.',
    env: [
      'INTEGRATION_SYNC_RUNNER_DISABLED',
      'INTEGRATION_SYNC_RUNNER_INTERVAL_MS',
      'GOOGLE_SEARCH_CONSOLE_SYNC_DISABLED',
      'GOOGLE_SEARCH_CONSOLE_SYNC_STALE_MS',
      'GOOGLE_ADS_METRICS_SYNC_DISABLED',
      'GOOGLE_ADS_METRICS_SYNC_STALE_MS',
    ],
    start: startIntegrationSyncRunner,
  },
]

export function startAutomationRunners() {
  return automationRunners.map((runner) => {
    try {
      return { id: runner.id, handle: runner.start() }
    } catch (error) {
      console.error(`[automation-runners] Failed to start ${runner.id}:`, error)
      return { id: runner.id, handle: null }
    }
  })
}
