import { useEffect, useState } from 'react';
import { getSupabaseClient } from '@/lib/supabase';

export type BusinessLifecycleEvent = {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  created_at: string;
};

export function useBusinessTransitionEvents(recordType: string, recordId?: string) {
  const [events,setEvents]=useState<BusinessLifecycleEvent[]>([]);
  useEffect(()=>{
    let active=true;
    if(!recordId){setEvents([]);return()=>{active=false};}
    void (async()=>{
      try{
        const db=await getSupabaseClient();
        const {data,error}=await db.from('business_transition_events')
          .select('id,event_type,from_status,to_status,note,created_at')
          .eq('record_type',recordType).eq('record_id',recordId)
          .order('created_at',{ascending:false}).limit(30);
        if(error)throw error;
        if(active)setEvents((data||[]) as BusinessLifecycleEvent[]);
      }catch{if(active)setEvents([]);}
    })();
    return()=>{active=false};
  },[recordType,recordId]);
  return events;
}
