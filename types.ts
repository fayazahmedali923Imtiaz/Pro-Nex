
export interface Message {
  id: number;
  text?: string;
  imageUrl?: string;
  imageBase64?: string; 
  imageMimeType?: string;
  sender: 'user' | 'bot';
  avatar: string;
  isLoading?: boolean;
  sources?: Array<{
    title: string;
    uri: string;
  }>;
}
