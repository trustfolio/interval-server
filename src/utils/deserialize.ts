import { UsageEnvironment } from '@prisma/client'
export * from '@trustfolio/interval-sdk/dist/utils/deserialize'

export function getUsageEnvironment(
  env: string | undefined | null
): UsageEnvironment {
  return env?.toUpperCase() === 'DEVELOPMENT'
    ? 'DEVELOPMENT'
    : ('PRODUCTION' as UsageEnvironment)
}
