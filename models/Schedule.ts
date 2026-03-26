import { model, models, Schema } from 'mongoose'
import connectToDatabase from '@/lib/mongodb'

const ScheduleSchema = new Schema(
  {
    owner_user_id: { type: String, required: true },
    agent_id: { type: String, required: true },
    message: { type: String, required: true },
    cron_expression: { type: String, required: true },
    timezone: { type: String, default: 'UTC' },
    max_retries: { type: Number, default: 3 },
    retry_delay: { type: Number, default: 300 },
    is_active: { type: Boolean, default: true },
    next_run_time: { type: Date, default: null },
    last_run_at: { type: Date, default: null },
    last_run_success: { type: Boolean, default: null },
    last_run_started_at: { type: Date, default: null },
    lock_owner: { type: String, default: null, index: true },
    lock_expires_at: { type: Date, default: null, index: true },
  },
  { timestamps: true }
)

ScheduleSchema.index({ owner_user_id: 1, is_active: 1 })
ScheduleSchema.index({ is_active: 1, next_run_time: 1 })
ScheduleSchema.index({ is_active: 1, lock_expires_at: 1 })

export default async function getScheduleModel() {
  await connectToDatabase()
  return models.Schedule || model('Schedule', ScheduleSchema)
}
