import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type FeedbackType = 'suggestion' | 'bug' | 'praise' | 'other';

export async function enviarFeedback(
  input: {
    type: FeedbackType;
    message: string;
    rating?: number | null;
    screenshotUrl?: string | null;
  },
  isDemoMode: boolean
): Promise<void> {
  if (isDemoMode) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return;
  }

  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase.from('feedbacks').insert({
    user_id: userData.user?.id ?? null,
    type: input.type,
    message: input.message,
    rating: input.rating ?? null,
    screenshot_url: input.screenshotUrl ?? null,
    app_version: Constants.expoConfig?.version ?? null,
    platform: Platform.OS,
    device_info: `${Constants.deviceName ?? ''} ${Platform.Version ?? ''}`.trim() || null,
  });
  if (error) throw error;
}
