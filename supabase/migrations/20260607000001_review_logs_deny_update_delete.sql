CREATE POLICY IF NOT EXISTS "review_logs: deny update" ON review_logs FOR UPDATE USING (false);
CREATE POLICY IF NOT EXISTS "review_logs: deny delete" ON review_logs FOR DELETE USING (false);
