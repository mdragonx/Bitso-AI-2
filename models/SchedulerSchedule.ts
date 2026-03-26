import { model, models, Schema } from 'mongoose'
import connectToDatabase from '@/lib/mongodb'

const SchedulerScheduleSchema = new Schema(
  {
    user_id: { type: String, required: true, index: true },
    agent_id: { type: String, required: true, index: true },
    message: { type: String, required: true },
    cron_expression: { type: String, required: true },
    timezone: { type: String, default: 'UTC' },
    max_retries: { type: Number, default: 3 },
    retry_delay: { type: Number, default: 300 },
    is_active: { type: Boolean, default: true, index: true },
    next_run_time: { type: Date, default: null },
    last_run_at: { type: Date, default: null },
    last_run_success: { type: Boolean, default: null },
  },
  { timestamps: true }
)

export default async function getSchedulerScheduleModel() {
  await connectToDatabase()
  return models.SchedulerSchedule || model('SchedulerSchedule', SchedulerScheduleSchema)
}
