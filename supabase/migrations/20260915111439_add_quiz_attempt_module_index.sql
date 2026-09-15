-- Covers the quiz-attempt foreign key for module deletion and joins.
create index user_quiz_attempts_module_id_idx
  on public.user_quiz_attempts (module_id);
