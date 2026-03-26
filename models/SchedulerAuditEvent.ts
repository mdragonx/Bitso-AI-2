import { model, models, Schema } from 'mongoose'
import connectToDatabase from '@/lib/mongodb'

const SchedulerAuditEventSchema = new Schema(
  {
    owner_user_id: { type: String, required: true, immutable: true, index: true },
    schedule_id: { type: String, default: null, immutable: true, index: true },
    action: {
      type: String,
      required: true,
      immutable: true,
      enum: ['create', 'pause', 'resume', 'trigger', 'execute'],
      index: true,
    },
    provider: { type: String, required: true, immutable: true, index: true },
    status: { type: String, required: true, immutable: true, enum: ['success', 'failure'], index: true },
    latency_ms: { type: Number, required: true, immutable: true },
    error_class: { type: String, default: null, immutable: true },
    details: { type: Schema.Types.Mixed, default: {}, immutable: true },
    occurred_at: { type: Date, default: Date.now, immutable: true, index: true },
  },
  { timestamps: true }
)

SchedulerAuditEventSchema.index({ owner_user_id: 1, occurred_at: -1 })
SchedulerAuditEventSchema.index({ schedule_id: 1, occurred_at: -1 })
SchedulerAuditEventSchema.index({ action: 1, status: 1, occurred_at: -1 })

export default async function getSchedulerAuditEventModel() {
  await connectToDatabase()
  return models.SchedulerAuditEvent || model('SchedulerAuditEvent', SchedulerAuditEventSchema)
}
