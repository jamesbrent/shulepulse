# Exam Approval Workflow — Implementation Plan

## Current State Summary

- `grades` table has 28 columns including workflow fields (`status`, `approved`, `approved_by`, `approved_at`, `rejection_reason`, `submitted_at`)
- Status flow: `draft` → `submitted` → `approved`/`rejected`/`locked` (enforced by CHECK constraint in migration v6)
- No `exam_uploads` table exists — exam file uploads are not tracked
- Question papers use `question_papers` table + `documents` storage bucket (upload path: `{schoolId}/question_papers/`)
- No `exam-papers` storage bucket exists
- Teacher `MarksEntry.jsx` upserts grades but does NOT upload exam files
- HOD `DeptExams.jsx` uses `window.prompt()` for rejection (no modal)
- HOD `MarksApproval.jsx` already has proper modals
- ClassTeacher `PerformanceTracker.jsx` shows ALL school grades (not filtered to their class or to approved status)
- DeputyAdmin `Exams.jsx` has basic approval with no file visibility
- Admin `GradesPage.jsx` has approval workflow but no exam file management
- Parent `components/AcademicResults.jsx` shows grades with no status filtering

---

## Phase 1: Database Schema

### 1A. New migration file: `supabase/migrations/021_exam_uploads.sql`

```sql
-- Create exam_uploads table
CREATE TABLE IF NOT EXISTS exam_uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  exam_type TEXT NOT NULL,
  class_name TEXT,
  term TEXT NOT NULL,
  year INTEGER NOT NULL,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT CHECK (file_type IN ('pdf', 'docx', 'doc')),
  file_size BIGINT,
  uploaded_by UUID REFERENCES profiles(id),
  uploaded_by_role TEXT CHECK (uploaded_by_role IN ('teacher', 'hod', 'admin')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(school_id, subject, exam_type, class_name, term, year)
);

-- Indexes
CREATE INDEX idx_exam_uploads_school ON exam_uploads(school_id);
CREATE INDEX idx_exam_uploads_term ON exam_uploads(term, year);
CREATE INDEX idx_exam_uploads_status ON exam_uploads(status);

-- Enable RLS
ALTER TABLE exam_uploads ENABLE ROW LEVEL SECURITY;

-- School isolation (all roles)
CREATE POLICY "exam_uploads_school_isolation"
  ON exam_uploads FOR ALL
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- Teacher: can insert/update their own uploads
CREATE POLICY "exam_uploads_teacher_insert"
  ON exam_uploads FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND uploaded_by_role = 'teacher'
  );

-- HOD: can insert/update uploads within their school
CREATE POLICY "exam_uploads_hod_insert"
  ON exam_uploads FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND uploaded_by_role = 'hod'
  );

-- Admin/Deputy: full access within school (covered by school_isolation)

-- Storage bucket for exam papers
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-papers', 'exam-papers', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: authenticated users can upload to their school folder
CREATE POLICY "exam_papers_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'exam-papers'
    AND auth.role() = 'authenticated'
  );

-- Storage policy: authenticated users can read within their school
CREATE POLICY "exam_papers_read"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'exam-papers'
    AND auth.role() = 'authenticated'
  );
```

### 1B. Add `teacher_comments` table if missing (verify via code — already exists)

### 1C. Verify `question_papers` table exists (it does, used by ExamSetup.jsx)

---

## Phase 2: Shared Utilities

### 2A. Create `src/utils/examUpload.js` — shared exam file upload helper

```js
// Functions:
// - uploadExamFile(file, { schoolId, subject, examType, className, term, year, uploadedBy, uploadedByRole })
//   → Uploads to storage bucket 'exam-papers', upserts exam_uploads record
//   → Returns { id, file_url, file_name, file_type }
//
// - deleteExamFile(uploadId)
//   → Deletes from storage + DB
//
// - fetchExamUploads(schoolId, { term, year, subject, examType, className })
//   → Returns exam_uploads records with filters
//
// - getExamFileUrl(filePath)
//   → Returns signed URL from 'exam-papers' bucket
```

### 2B. Create `src/hooks/useExamUploads.js` — React hook for exam upload state

```js
// Provides: { uploads, loading, uploadFile, removeFile, getUploadForGroup }
// Group key = `${subject}-${examType}-${className}`
```

---

## Phase 3: Teacher Pages (`src/pages/teacher/`)

### 3A. Modify `MarksEntry.jsx` — Add exam file upload

**Current behavior:** Upserts grade rows, sets status to 'submitted' or 'draft'. No file upload.

**Changes:**
1. Add `examFile` state and a hidden `<input type="file" accept=".pdf,.doc,.docx">` 
2. In the submit flow (`handleSubmit`), AFTER upserting grades:
   - If `examFile` is set, call `uploadExamFile()` with `uploadedByRole: 'teacher'`
   - Store the returned `file_url` on the exam_uploads record
3. Add a file upload section in the marks entry header area:
   - Show "Exam Paper (optional)" with upload button
   - Show file name + remove button if file is selected
   - Accept only `.pdf`, `.doc`, `.docx`; max 10MB
4. On the dashboard/class cards view, show a paper icon if an exam file exists for that subject+examType+class
5. Add CSS with `me-` prefix (existing convention)

**File:** `src/pages/teacher/MarksEntry.jsx`
**Lines to modify:** ~460-500 (submit flow), add new state around line 20, add UI around the submit button area

### 3B. Verify no other teacher files need changes
- `GradesPage.jsx` — read-only analytics, no changes needed
- Other files — no grade submission logic

---

## Phase 4: HOD Pages (`src/pages/HOD/`)

### 4A. Modify `DeptExams.jsx` — Replace prompt() with modal, add file view/upload

**Current behavior:** Uses `window.prompt()` for rejection. No file upload. Groups by `${subject}-${examType}`.

**Changes:**
1. Import and use the `Modal` component pattern from `MarksApproval.jsx`
2. Replace `window.prompt('Reason for rejection:')` with a proper modal containing a textarea
3. Add approval confirmation modal
4. In the detail review view:
   - Fetch exam_uploads for the current group's subject+examType+className+term+year
   - If a file exists, show it inline (PDF as iframe/embed, docx as download link)
   - If no file exists, show an "Upload Exam Paper" control (same pattern as teacher)
   - On HOD upload, set `uploadedByRole: 'hod'`
5. Show "Uploaded by HOD (on behalf of teacher)" badge when `uploaded_by_role === 'hod'`
6. Add CSS with `hod-` prefix (existing convention)

**File:** `src/pages/HOD/DeptExams.jsx`
**Lines to modify:** ~115-140 (reject handler), ~200-275 (detail view)

### 4B. Modify `ExamSetup.jsx` — Question papers tab already works
- No changes needed for question papers (already functional)
- The `exam_uploads` table is separate from `question_papers`

### 4C. `MarksApproval.jsx` — Already has modals, minimal changes
- Add exam file visibility in the pending approval detail view
- Show upload control for fallback (same as DeptExams)
- Fetch from `exam_uploads` table

### 4D. `DeptAnalytics.jsx` — No changes needed (read-only analytics)

### 4E. `ReportCenter.jsx` — No changes needed (export functionality)

### 4F. `SubjectPerformance.jsx` — No changes needed

### 4G. `TeacherReview.jsx` — No changes needed

---

## Phase 5: ClassTeacher Pages (`src/pages/ClassTeacher/`)

### 5A. Modify `PerformanceTracker.jsx` — Filter to approved grades + their class

**Current behavior:** Fetches ALL grades for the school with `school_id` filter only. Shows all statuses.

**Changes:**
1. Filter grades to ONLY `status = 'approved'` (or `status = 'published'`)
2. Add `.eq('class', teacherData.class)` filter to restrict to the class teacher's assigned class
3. Add a "Report Card" button that generates/opens report cards for the class
4. Use the existing `ReportCard` component from `src/components/students/ReportCard.jsx`
5. Use `buildReportCardHtml()` or `bulkReportCards.js` for PDF generation
6. Add exam type filter (CAT 1, CAT 2, End Term)
7. Add CSS with `ct-perf-` prefix (existing convention)

**File:** `src/pages/ClassTeacher/PerformanceTracker.jsx`
**Lines to modify:** ~55-67 (fetchGrades query), add report card generation function

### 5B. Consider adding a "Report Cards" nav item to `ClassTeacherDashboard.jsx`
- Add nav item: `{ key: 'reports', label: 'Report Cards', icon: FileText }`
- Render a new `ClassReportCards.jsx` component that uses `bulkReportCards.js`
- Add CSS with `ct-` prefix

### 5C. Create `src/pages/ClassTeacher/ClassReportCards.jsx` (new file)
- Uses `fetchBulkData()` from `bulkReportCards.js`
- Filters to the class teacher's assigned class
- Shows per-student report card preview
- PDF download for individual or bulk

---

## Phase 6: DeputyAdministrator Pages (`src/pages/DeputyAdministrator/`)

### 6A. Modify `Exams.jsx` — Enhance school-wide view

**Current behavior:** Two tabs (All Records, Pending Approvals). Basic approve/reject.

**Changes:**
1. Add a third tab: "Exam Files" — shows all exam_uploads for the school
   - Table: Subject, Exam Type, Class, Term, Year, File, Uploaded By, Role, Status
   - Flags groups with NO uploaded file
   - Allows approve/reject of uploaded files
2. Enhance the Pending Approvals tab:
   - Show file upload status per group (file uploaded / no file)
   - Allow Deputy Admin to upload files on behalf of teachers
3. Add summary cards:
   - Total Exam Groups, Files Uploaded, Files Pending, Files Missing
4. Add CSS with `exam-` and `da-` prefixes (existing convention)

**File:** `src/pages/DeputyAdministrator/Exams.jsx`
**Lines to modify:** Add new tab, enhance existing tabs

### 6B. `DeputyAdminDashboard.jsx` — Enhance overview
- Add exam file status to the dashboard stats
- Show "Exam Files Uploaded" count alongside "Exam Records"

### 6C. Other DeputyAdmin files — No changes needed

---

## Phase 7: Admin Pages (`src/pages/admin/`)

### 7A. Modify `GradesPage.jsx` — Add exam file management + override capability

**Current behavior:** 5 tabs including "Approve Pending". Can approve/reject.

**Changes:**
1. In the "Approve Pending" tab:
   - Show exam file upload status per group
   - Allow file upload on behalf of any teacher
   - Show "Uploaded by" info
2. Add override capability:
   - Admin can change any approved/rejected grade back to any status
   - Log override in grade_audit_logs with action='override'
3. In the "Grade Records" tab:
   - Add a column showing exam file status (icon)
   - Click to view/download the uploaded file

**File:** `src/pages/admin/GradesPage.jsx`

### 7B. Create `src/pages/admin/ExamSettings.jsx` (new file) — Exam type/schedule management

**Purpose:** Full CRUD for exam types and schedules.

**Features:**
1. Exam Types tab:
   - List current exam types (CAT 1, CAT 2, End Term)
   - Add/edit/delete custom exam types
   - Set max marks, weightage per type
   - Store in a new `exam_types` table or in `platform_settings` JSONB
2. Exam Schedule tab:
   - Create exam periods (e.g., "Term 2 2026 — CAT 1 Window: Jul 15-19")
   - Link to term/year
   - Set start/end dates for submission windows
3. Settings tab:
   - Default grading scale selection
   - Auto-approve threshold (optional)

### 7C. Add nav item in `AdminDashboard.jsx`
- Add "Exam Settings" nav item pointing to `ExamSettings.jsx`
- Add CSS with `adm-` prefix (existing convention)

---

## Phase 8: Parent Pages (`src/pages/parent/`)

### 8A. Modify `components/AcademicResults.jsx` — Filter to approved grades only

**Current behavior:** Fetches all grades for `student_id = activeChild.id` with no status filter.

**Changes:**
1. Add `.in('status', ['approved', 'published'])` to the grades query
2. This ensures parents ONLY see grades that have been approved/published
3. Add a "No results available" message when no approved grades exist

**File:** `src/pages/parent/components/AcademicResults.jsx`
**Lines to modify:** ~30-35 (grades query)

### 8B. Modify `components/Overview.jsx` — Same filter

**Changes:**
1. Add `.in('status', ['approved', 'published'])` to the grades query on line ~60

**File:** `src/pages/parent/components/Overview.jsx`

### 8C. RLS enforcement (critical)
The RLS policies on the `grades` table should already enforce this via school isolation, but we need an additional policy:

```sql
-- Parents can only see approved/published grades for their children
CREATE POLICY "grades_parent_approved_only"
  ON grades FOR SELECT
  USING (
    status IN ('approved', 'published')
    AND student_id IN (
      SELECT id FROM students WHERE parent_id = auth.uid()
    )
  );
```

**Note:** The existing school-isolation policy may already allow parents to see all grades in their school. This new policy would need to be more restrictive. Consider whether to use RLS or client-side filtering (client-side is simpler and already done in Phase 8A/8B).

---

## Phase 9: RLS Policies (comprehensive)

### 9A. Grades table — add parent-specific policy

```sql
-- Parents: SELECT only approved/published grades for their own children
CREATE POLICY "grades_parent_select"
  ON grades FOR SELECT
  USING (
    status IN ('approved', 'published')
    AND student_id IN (
      SELECT id FROM students WHERE parent_id = auth.uid()
    )
  );
```

### 9B. Exam_uploads table — policies already in Phase 1A

### 9C. Storage bucket — policies already in Phase 1A

### 9D. Verify existing policies don't conflict
- The school-isolation policy on `grades` uses `USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))` — this allows ALL users in a school to see ALL grades regardless of status
- The parent-specific policy would need to be added as an additional restriction
- **Important:** RLS policies are OR'd by default. To restrict parents, we'd need to either:
  - Use a single policy with conditional logic, OR
  - Rely on client-side filtering (simpler, already done in Phase 8)

---

## Phase 10: CSS Updates

### Files to modify:
1. `src/pages/teacher/MarksEntry.css` — add `me-file-*` classes for file upload UI
2. `src/pages/HOD/HODDashboard.css` — add `hod-file-*` classes for file display in review
3. `src/pages/ClassTeacher/PerformanceTracker.css` — add `ct-report-*` classes
4. `src/pages/DeputyAdministrator/Exams.css` — add `exam-file-*` classes
5. `src/pages/admin/GradesPage.css` — add file status column styles

---

## Implementation Order (Recommended)

1. **Phase 1** — Database migration (exam_uploads table + storage bucket + RLS)
2. **Phase 2** — Shared utilities (examUpload.js, useExamUploads.js)
3. **Phase 3** — Teacher MarksEntry.jsx (file upload on submit)
4. **Phase 4A** — HOD DeptExams.jsx (modal + file view/upload)
5. **Phase 4C** — HOD MarksApproval.jsx (file visibility)
6. **Phase 5** — ClassTeacher PerformanceTracker.jsx (approved-only filter + report cards)
7. **Phase 6** — DeputyAdmin Exams.jsx (enhanced school-wide view)
8. **Phase 7** — Admin GradesPage.jsx (override + file management)
9. **Phase 8** — Parent AcademicResults.jsx + Overview.jsx (approved-only filter)
10. **Phase 9** — RLS policies (if needed beyond client-side)
11. **Phase 10** — CSS updates throughout

---

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `supabase/migrations/021_exam_uploads.sql` | CREATE | 1 |
| `src/utils/examUpload.js` | CREATE | 2 |
| `src/hooks/useExamUploads.js` | CREATE | 2 |
| `src/pages/teacher/MarksEntry.jsx` | MODIFY | 3 |
| `src/pages/teacher/MarksEntry.css` | MODIFY | 10 |
| `src/pages/HOD/DeptExams.jsx` | MODIFY | 4A |
| `src/pages/HOD/MarksApproval.jsx` | MODIFY | 4C |
| `src/pages/HOD/HODDashboard.css` | MODIFY | 10 |
| `src/pages/ClassTeacher/PerformanceTracker.jsx` | MODIFY | 5A |
| `src/pages/ClassTeacher/ClassTeacherDashboard.jsx` | MODIFY | 5B |
| `src/pages/ClassTeacher/ClassReportCards.jsx` | CREATE | 5C |
| `src/pages/ClassTeacher/PerformanceTracker.css` | MODIFY | 10 |
| `src/pages/DeputyAdministrator/Exams.jsx` | MODIFY | 6A |
| `src/pages/DeputyAdministrator/DeputyAdminDashboard.jsx` | MODIFY | 6B |
| `src/pages/DeputyAdministrator/Exams.css` | MODIFY | 10 |
| `src/pages/admin/GradesPage.jsx` | MODIFY | 7A |
| `src/pages/admin/ExamSettings.jsx` | CREATE | 7B |
| `src/pages/admin/AdminDashboard.jsx` | MODIFY | 7C |
| `src/pages/parent/components/AcademicResults.jsx` | MODIFY | 8A |
| `src/pages/parent/components/Overview.jsx` | MODIFY | 8B |
| `src/pages/admin/GradesPage.css` | MODIFY | 10 |

**Total: 4 new files, 17 modified files**
