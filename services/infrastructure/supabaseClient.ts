import { supabase } from '@/sync/supabase';

export class SupabaseClientService {
  async getSession(): Promise<any> {
    const { data } = await supabase.auth.getSession();
    return data?.session || null;
  }

  async getUserId(): Promise<string | null> {
    const session = await this.getSession();
    return session?.user?.id || null;
  }

  async upsertRow(tableName: string, payload: any): Promise<{ data: any; error: any }> {
    const { data, error } = await supabase
      .from(tableName)
      .upsert(payload, { onConflict: 'id' })
      .select();
    return { data, error };
  }

  async deleteRow(tableName: string, id: string, ownerId: string): Promise<{ data: any; error: any }> {
    const { data, error } = await supabase
      .from(tableName)
      .delete()
      .eq('id', id)
      .eq('owner_id', ownerId);
    return { data, error };
  }

  async fetchRows(tableName: string, ownerId: string): Promise<{ data: any[] | null; error: any }> {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('owner_id', ownerId)
      .is('deleted_at', null);
    return { data, error };
  }
}

export const supabaseClient = new SupabaseClientService();
