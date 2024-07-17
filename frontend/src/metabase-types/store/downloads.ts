export interface Download {
  id: number;
  name: string;
  status: "complete" | "in-progress" | "error";
  error?: string;
}

export type DownloadsState = Download[];
