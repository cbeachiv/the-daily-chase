// Your three rotating workouts (Mon/Wed/Fri), templated from the most recent
// A/B/C sessions in the imported history. Editing here changes the prefilled
// exercise list when you start a workout — sets/weights are always editable
// while logging.

export interface TemplateExercise {
  name: string;
  sets: number; // default number of set rows
  targetReps: string; // shown as a hint, e.g. "8-10"
  bodyweight: boolean; // weight defaults to 0 and best is shown as reps
}

export interface WorkoutTemplate {
  key: string; // "a" | "b" | "c" | "empty"
  name: string; // "Workout A"
  exercises: TemplateExercise[];
}

const A: WorkoutTemplate = {
  key: "a",
  name: "Workout A",
  exercises: [
    { name: "Bench Press (Barbell)", sets: 3, targetReps: "8-10", bodyweight: false },
    { name: "Romanian Deadlift (Barbell)", sets: 3, targetReps: "8-10", bodyweight: false },
    { name: "Pull Up", sets: 3, targetReps: "8-10", bodyweight: true },
    { name: "Ab Wheel", sets: 3, targetReps: "15", bodyweight: true },
    { name: "Cross Body Cable Lateral Raise", sets: 3, targetReps: "10", bodyweight: false },
    { name: "Bicep Curl (Dumbbell)", sets: 3, targetReps: "10", bodyweight: false },
    { name: "Standing Calf Raise (Machine)", sets: 3, targetReps: "10", bodyweight: false },
  ],
};

const B: WorkoutTemplate = {
  key: "b",
  name: "Workout B",
  exercises: [
    { name: "Belt Squat", sets: 3, targetReps: "8-10", bodyweight: false },
    { name: "Weighted Sit up", sets: 3, targetReps: "10", bodyweight: false },
    { name: "Overhead Press (Barbell)", sets: 3, targetReps: "8", bodyweight: false },
    { name: "Plate Loaded Chest press", sets: 3, targetReps: "8", bodyweight: false },
    { name: "Iso-Lateral Row (Machine)", sets: 3, targetReps: "8-10", bodyweight: false },
    { name: "Seated Calf Raise (Machine)", sets: 3, targetReps: "10", bodyweight: false },
    { name: "Triceps Extension (Dumbbell)", sets: 3, targetReps: "10", bodyweight: false },
    { name: "Reverse Crunch", sets: 3, targetReps: "15", bodyweight: true },
  ],
};

const C: WorkoutTemplate = {
  key: "c",
  name: "Workout C",
  exercises: [
    { name: "Trap Bar Deadlift", sets: 3, targetReps: "6-8", bodyweight: false },
    { name: "Incline Bench Press (Dumbbell)", sets: 3, targetReps: "8-10", bodyweight: false },
    { name: "Iso-Lateral Row (Machine)", sets: 3, targetReps: "10-12", bodyweight: false },
    { name: "Leg Extension (Machine)", sets: 3, targetReps: "10-15", bodyweight: false },
    { name: "Lateral Raise (Dumbbell)", sets: 3, targetReps: "10", bodyweight: false },
    { name: "Preacher Curl (Dumbbell)", sets: 3, targetReps: "8-10", bodyweight: false },
    { name: "Hanging Leg Raise", sets: 3, targetReps: "15", bodyweight: true },
  ],
};

const EMPTY: WorkoutTemplate = { key: "empty", name: "Workout", exercises: [] };

export const TEMPLATES: WorkoutTemplate[] = [A, B, C];

export function getTemplate(key: string): WorkoutTemplate {
  return TEMPLATES.find((t) => t.key === key) ?? EMPTY;
}
