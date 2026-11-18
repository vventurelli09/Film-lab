'use client';
import { useCallback, useEffect, useState } from 'react';
import PlanCard from '@/components/PlanCard';
import { Empty, Tabs } from '@/components/ui';
import { sb } from '@/lib/supabase';

export default function Plans() {
  const [plans, setPlans] = useState<any[] | null>(null);
  const [athletes, setAthletes] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [tab, setTab] = useState('approved');

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([
      sb().from('plans').select('*').order('created_at', { ascending: false }),
      sb().from('athletes').select('*'),
    ]);
    setPlans(p.data || []);
    setAthletes(a.data || []);
    const ids = (p.data || []).map((x: any) => x.id);
    setLogs(ids.length ? (await sb().from('plan_logs').select('*').in('plan_id', ids)).data || [] : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (plans === null) return <p className="text-slate-400">Loading…</p>;
  const shown = plans.filter((p) => p.status === tab);
  const count = (s: string) => plans.filter((p) => p.status === s).length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Practice plans</h1>
      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'approved', label: 'Active', badge: count('approved') },
        { id: 'draft', label: 'Drafts', badge: count('draft') },
        { id: 'completed', label: 'Done' },
      ]} />
      {shown.length === 0 ? (
        <Empty title={tab === 'approved' ? 'No active plans' : tab === 'draft' ? 'No drafts' : 'Nothing completed yet'} body="Plans are built from a film breakdown." />
      ) : (
        <div className="space-y-3">
          {shown.map((p) => (
            <PlanCard key={p.id} plan={p} athlete={athletes.find((a) => a.id === p.athlete_id)} logs={logs.filter((l) => l.plan_id === p.id)} onChange={load} showLink />
          ))}
        </div>
      )}
    </div>
  );
}
