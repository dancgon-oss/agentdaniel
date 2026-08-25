import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

const TABLE = 'wa_auth_kv';

/**
 * Baileys auth state backed by a Supabase table instead of local disk.
 * Needed because free hosting (HF Spaces) does not guarantee persistent
 * disk across restarts, which would otherwise force a QR rescan every time
 * the container sleeps/restarts.
 */
export async function useSupabaseAuthState(supabase) {
  const readData = async (key) => {
    const { data } = await supabase.from(TABLE).select('value').eq('key', key).maybeSingle();
    if (!data) return null;
    return JSON.parse(JSON.stringify(data.value), BufferJSON.reviver);
  };

  const writeData = async (key, value) => {
    const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
    await supabase.from(TABLE).upsert({ key, value: serialized, updated_at: new Date().toISOString() });
  };

  const removeData = async (key) => {
    await supabase.from(TABLE).delete().eq('key', key);
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
  };
}
