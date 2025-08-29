import mongoose from 'mongoose';

const CourseSchema = new mongoose.Schema({
  name: { type: String, required: true },
  hoursPerDay: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  description: String,
  sessions: [{
    id: String,
    interval: String,
    date: Date,
    originalDate: Date,
    hoursNeeded: Number,
    completed: { type: Boolean, default: false },
    success: Boolean,
    rescheduled: { type: Boolean, default: false }
  }],
  createdAt: { type: Date, default: Date.now }
});

const ConstraintSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  startHour: { type: Number, default: 0 },
  endHour: { type: Number, default: 24 },
  description: { type: String, default: 'Contrainte personnelle' },
  type: { type: String, enum: ['manual', 'auto', 'recurring'], default: 'manual' },
  createdAt: { type: Date, default: Date.now }
});

export const Course = mongoose.models.Course || mongoose.model('Course', CourseSchema);
export const Constraint = mongoose.models.Constraint || mongoose.model('Constraint', ConstraintSchema);

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(process.env.NEXT_PUBLIC_MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
