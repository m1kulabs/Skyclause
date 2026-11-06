export interface CameraParams {
  org: string
  project: string
  sourceId: string
}
export const cameraPath = ({ org, project, sourceId }: CameraParams) =>
  `/${encodeURIComponent(org)}/${encodeURIComponent(project)}/camera/${encodeURIComponent(sourceId)}`
