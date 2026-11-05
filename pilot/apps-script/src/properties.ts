// The Script Properties from the #47 spec. Secrets live only here, never in the repo.
export const SCRIPT_PROPERTIES = [
  'SHEET_ID',
  'RESPONSES_SHEET_ID',
  'ROOT_FOLDER_ID',
  'CROSSINGS_SKY_FOLDER_ID',
  'CROSSINGS_CROWD_FOLDER_ID',
  'CROSSINGS_REPLAY_FOLDER_ID',
  'FRAMES_FOLDER_ID',
  'RAW_FOLDER_ID',
  'GRADES_FOLDER_ID',
  'LISTINGS_FOLDER_ID',
  'CONDITIONS_CALENDAR_ID',
  'PROJECT_SLUG',
  'TEAM_ALERT_EMAILS',
  'CAMERA_TOKEN',
  'PI_TOKEN',
  'CAMERA_DAY_START',
  'CAMERA_DAY_END',
  'SEMESTER_ENDS_ON',
  'GE_SCHEDULES_REFRESHED_AT',
  'REPLAY_SHEET_ID',
  'LABEL_TOKEN_A',
  'LABEL_TOKEN_B',
  'PILOT_SCRIPT_ID'
] as const

export type ScriptProperty = (typeof SCRIPT_PROPERTIES)[number]

export type GetProperty = (name: ScriptProperty) => string | null
