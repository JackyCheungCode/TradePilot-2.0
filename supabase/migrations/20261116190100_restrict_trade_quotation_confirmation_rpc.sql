-- The confirmation routine is SECURITY DEFINER and is called only by the
-- authenticated Worker after it has validated the caller's Supabase session.
revoke all on function public.confirm_trade_quotation(uuid, uuid) from public;
revoke all on function public.confirm_trade_quotation(uuid, uuid) from anon;
revoke all on function public.confirm_trade_quotation(uuid, uuid) from authenticated;
grant execute on function public.confirm_trade_quotation(uuid, uuid) to service_role;
