import { model, models, Schema } from 'mongoose'
import connectToDatabase from '@/lib/mongodb'

const ScheduleExecutionSchema = new Schema(
  {
    schedule_id: { type: String, required: true },
    owner_user_id: { type: String, required: true },
    executed_at: { type: Date, default: Date.now },
    attempt: { type: Number, default: 1 },
    success: { type: Boolean, required: true },
    response_status: { type: Number, default: 0 },
    response_output: { type: String, default: '' },
    error_message: { type: String, default: null },
    provider: { type: String, default: 'local' },
  },
  { timestamps: true }
)

ScheduleExecutionSchema.index({ schedule_id: 1, executed_at: -1 })

export default async function getScheduleExecutionModel() {
  await connectToDatabase()
  return models.ScheduleExecution || model('ScheduleExecution', ScheduleExecutionSchema)
}
