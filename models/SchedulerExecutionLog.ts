import { model, models, Schema } from 'mongoose'
import connectToDatabase from '@/lib/mongodb'

const SchedulerExecutionLogSchema = new Schema(
  {
    schedule_id: { type: String, required: true, index: true },
    agent_id: { type: String, required: true, index: true },
    user_id: { type: String, required: true, index: true },
    session_id: { type: String, default: '' },
    executed_at: { type: Date, default: Date.now, index: true },
    attempt: { type: Number, default: 1 },
    max_attempts: { type: Number, default: 1 },
    success: { type: Boolean, required: true, index: true },
    payload_message: { type: String, default: '' },
    response_status: { type: Number, default: 0 },
    response_output: { type: String, default: '' },
    error_message: { type: String, default: null },
  },
  { timestamps: true }
)

export default async function getSchedulerExecutionLogModel() {
  await connectToDatabase()
  return models.SchedulerExecutionLog || model('SchedulerExecutionLog', SchedulerExecutionLogSchema)
}
