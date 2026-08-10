-- Add 'class' and 'assigned_classes' columns to teachers table
-- class = single class (legacy), assigned_classes = array of classes for multi-class teachers
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS class TEXT;
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS assigned_classes TEXT[] DEFAULT '{}';
