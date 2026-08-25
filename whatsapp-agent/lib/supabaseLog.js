export async function logMessage(supabase, { jid, role, content }) {
  await supabase.from('messages').insert({ jid, role, content });
}

export async function getHistory(supabase, jid, limit = 12) {
  const { data } = await supabase
    .from('messages')
    .select('role, content')
    .eq('jid', jid)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []).reverse().map((m) => ({ role: m.role, content: m.content }));
}
