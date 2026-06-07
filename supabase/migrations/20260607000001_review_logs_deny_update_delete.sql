CREATE POLICY "review_logs: owner update" ON review_logs FOR UPDATE USING (false);
CREATE POLICY "review_logs: owner delete" ON review_logs FOR DELETE USING (false);
