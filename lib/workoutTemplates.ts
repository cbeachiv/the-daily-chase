// Your three rotating workouts (Mon/Wed/Fri). Fall 2026 cut: machine-first,
// full body, double progression (stay at a weight until every set hits the top
// of the range, then go up one pin/plate). Names match the Strong export where
// the lift has history, so progression charts carry over. Editing here changes
// the prefilled exercise list when you start a workout — sets/weights are
// always editable while logging.

export interface TemplateExercise {
  name: string;
  sets: number; // default number of set rows
  targetReps: string; // shown as a hint, e.g. "8-10"
  bodyweight: boolean; // weight defaults to 0 and best is shown as reps
  rest?: string; // rest between sets, e.g. "2 min"
}

export interface WorkoutTemplate {
  key: string; // "a" | "b" | "c" | "empty"
  name: string; // "Workout A"
  exercises: TemplateExercise[];
}

const MAIN = "2 min";
const ACC = "60-90 s";

const A: WorkoutTemplate = {
  key: "a",
  name: "Workout A",
  exercises: [
    { name: "Leg Press", sets: 3, targetReps: "6-10", bodyweight: false, rest: MAIN },
    { name: "Chest Press (Machine)", sets: 3, targetReps: "6-10", bodyweight: false, rest: MAIN },
    { name: "Seated Row (Cable)", sets: 3, targetReps: "8-12", bodyweight: false, rest: MAIN },
    { name: "Seated Leg Curl (Machine)", sets: 3, targetReps: "10-15", bodyweight: false, rest: ACC },
    { name: "Lateral Raise (Machine)", sets: 3, targetReps: "12-15", bodyweight: false, rest: ACC },
    { name: "Cable Crunch", sets: 3, targetReps: "10-15", bodyweight: false, rest: ACC },
  ],
};

const B: WorkoutTemplate = {
  key: "b",
  name: "Workout B",
  exercises: [
    { name: "Hack Squat", sets: 3, targetReps: "6-10", bodyweight: false, rest: MAIN },
    { name: "Lat Pulldown (Cable)", sets: 3, targetReps: "8-12", bodyweight: false, rest: MAIN },
    { name: "Shoulder Press (Machine)", sets: 3, targetReps: "8-12", bodyweight: false, rest: MAIN },
    { name: "Hip Thrust (Machine)", sets: 3, targetReps: "8-12", bodyweight: false, rest: ACC },
    { name: "Chest Fly", sets: 2, targetReps: "12-15", bodyweight: false, rest: ACC },
    // Superset: curl then pushdown, rest after the pair.
    { name: "Bicep Curl (Cable)", sets: 2, targetReps: "12-15", bodyweight: false, rest: ACC },
    { name: "Triceps Pushdown (Cable - Straight Bar)", sets: 2, targetReps: "12-15", bodyweight: false, rest: ACC },
  ],
};

const C: WorkoutTemplate = {
  key: "c",
  name: "Workout C",
  exercises: [
    { name: "Belt Squat", sets: 3, targetReps: "8-12", bodyweight: false, rest: MAIN },
    { name: "Incline Chest Press (Machine)", sets: 3, targetReps: "8-12", bodyweight: false, rest: MAIN },
    { name: "Iso-Lateral Row (Machine)", sets: 3, targetReps: "8-12", bodyweight: false, rest: MAIN },
    { name: "Leg Extension (Machine)", sets: 3, targetReps: "12-15", bodyweight: false, rest: ACC },
    { name: "Reverse Fly (Machine)", sets: 2, targetReps: "15-20", bodyweight: false, rest: ACC },
    { name: "Hanging Leg Raise", sets: 3, targetReps: "10-15", bodyweight: true, rest: ACC },
  ],
};

const EMPTY: WorkoutTemplate = { key: "empty", name: "Workout", exercises: [] };

export const TEMPLATES: WorkoutTemplate[] = [A, B, C];

// Exercises benched out of a workout. Seeds the "Retired" bucket the first time;
// after that, retire/un-retire is saved per-user in Firestore (see useWorkouts).
// Holds the pre-cut barbell program so any of it is one tap from coming back.
export const RETIRED_DEFAULTS: TemplateExercise[] = [
  { name: "Bench Press (Barbell)", sets: 3, targetReps: "3-5 top, 8 back-off", bodyweight: false },
  { name: "Romanian Deadlift (Barbell)", sets: 3, targetReps: "8-10", bodyweight: false },
  { name: "Pull Up", sets: 3, targetReps: "8-10", bodyweight: true },
  { name: "Ab Wheel", sets: 3, targetReps: "15", bodyweight: true },
  { name: "Cross Body Cable Lateral Raise", sets: 3, targetReps: "10", bodyweight: false },
  { name: "Bicep Curl (Dumbbell)", sets: 3, targetReps: "10", bodyweight: false },
  { name: "Standing Calf Raise (Machine)", sets: 3, targetReps: "10", bodyweight: false },
  { name: "Overhead Press (Barbell)", sets: 3, targetReps: "8", bodyweight: false },
  { name: "Close Grip Bench Press", sets: 3, targetReps: "8", bodyweight: false },
  { name: "Seated Calf Raise (Machine)", sets: 3, targetReps: "10", bodyweight: false },
  { name: "Overhead Cable Tricep Extension", sets: 3, targetReps: "10", bodyweight: false },
  { name: "Russian Twists", sets: 3, targetReps: "20", bodyweight: true },
  { name: "Trap Bar Deadlift", sets: 3, targetReps: "6-8", bodyweight: false },
  { name: "Incline Bench Press (Dumbbell)", sets: 3, targetReps: "8-10", bodyweight: false },
  { name: "Lateral Raise (Dumbbell)", sets: 3, targetReps: "10", bodyweight: false },
  { name: "Preacher Curl (Dumbbell)", sets: 3, targetReps: "8-10", bodyweight: false },
  { name: "Preacher Curl (EZ Bar)", sets: 3, targetReps: "8-10", bodyweight: false },
  { name: "Weighted Sit up", sets: 3, targetReps: "10", bodyweight: false },
  { name: "Reverse Crunch", sets: 3, targetReps: "15", bodyweight: true },
  { name: "Plate Loaded Chest press", sets: 3, targetReps: "8", bodyweight: false },
  { name: "Triceps Extension (Dumbbell)", sets: 3, targetReps: "10", bodyweight: false },
];

export function getTemplate(key: string): WorkoutTemplate {
  return TEMPLATES.find((t) => t.key === key) ?? EMPTY;
}
