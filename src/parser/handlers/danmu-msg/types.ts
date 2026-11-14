export interface MessageIdentity {
  timestamp: number | null;
  roomId: number | null;
  uid: number;
  name: string | null;
  content: string;
}
