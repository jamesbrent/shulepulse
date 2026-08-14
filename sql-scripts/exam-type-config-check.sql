-- Exam type configuration check (expected: likely empty list)
SELECT id, name, label, max_marks, weightage, description, sort_order
FROM exam_type_config ORDER BY sort_order;
