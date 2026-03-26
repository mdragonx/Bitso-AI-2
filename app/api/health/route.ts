import { NextResponse } from 'next/server'
import connectToDatabase from '@/lib/mongodb'
import getScheduleExecutionModel from '@/models/ScheduleExecution'
import getScheduleModel from '@/models/Schedule'
import getSchedulerAuditEventModel from '@/models/SchedulerAuditEvent'
import getUploadedAssetModel from '@/models/UploadedAsset'

function parseFeatureFlag(value: string | undefined): boolean {
  if (value === undefined) return true
  return value.toLowerCase() !== 'false'
}

type ModelLoader = {
  name: string
  load: () => Promise<any>
}

const SCHEDULER_MODELS: ModelLoader[] = [
  { name: 'Schedule', load: getScheduleModel },
  { name: 'ScheduleExecution', load: getScheduleExecutionModel },
  { name: 'SchedulerAuditEvent', load: getSchedulerAuditEventModel },
]

const UPLOAD_MODELS: ModelLoader[] = [{ name: 'UploadedAsset', load: getUploadedAssetModel }]

async function resolveExpectedCollections() {
  const schedulerEnabled = parseFeatureFlag(process.env.ENABLE_SCHEDULER)
  const uploadEnabled = parseFeatureFlag(process.env.ENABLE_UPLOAD)
  const ragEnabled = parseFeatureFlag(process.env.ENABLE_RAG)
  const uploadCollectionsEnabled = uploadEnabled || ragEnabled

  const loaders: ModelLoader[] = []

  if (schedulerEnabled) {
    loaders.push(...SCHEDULER_MODELS)
  }

  if (uploadCollectionsEnabled) {
    loaders.push(...UPLOAD_MODELS)
  }

  const resolved = await Promise.all(
    loaders.map(async ({ name, load }) => {
      const model = await load()
      return { name, collection: model.collection.collectionName }
    })
  )

  return {
    expectedCollections: resolved,
    featureGates: {
      schedulerEnabled,
      uploadEnabled,
      ragEnabled,
      uploadCollectionsEnabled,
    },
  }
}

export async function GET() {
  try {
    const db = await connectToDatabase()
    const { expectedCollections, featureGates } = await resolveExpectedCollections()

    const existingCollections = await db.connection.db
      .listCollections({}, { nameOnly: true })
      .toArray()
      .then((collections) => new Set(collections.map((collection) => collection.name)))

    const missingCollections = expectedCollections.filter(
      ({ collection }) => !existingCollections.has(collection)
    )

    const readiness = missingCollections.length === 0 ? 'ready' : 'not_ready'

    return NextResponse.json(
      {
        status: 'ok',
        readiness,
        featureGates,
        checks: {
          requiredCollections: {
            expected: expectedCollections,
            missing: missingCollections,
          },
        },
      },
      { status: readiness === 'ready' ? 200 : 503 }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown readiness error'

    return NextResponse.json(
      {
        status: 'error',
        readiness: 'not_ready',
        error: message,
      },
      { status: 503 }
    )
  }
}
