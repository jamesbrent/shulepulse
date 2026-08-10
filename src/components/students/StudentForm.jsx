import { useEffect, useState } from 'react'

const CLASSES = [
  { label: 'Pre-Primary', options: ['PP1', 'PP2'] },
  { label: 'Lower Primary', options: ['Grade 1', 'Grade 2', 'Grade 3'] },
  { label: 'Upper Primary', options: ['Grade 4', 'Grade 5', 'Grade 6'] },
  { label: 'Junior School', options: ['Grade 7', 'Grade 8', 'Grade 9'] },
  { label: 'Senior School', options: ['Grade 10', 'Grade 11'] },
]

const INITIAL = {
  full_name: '',
  admission_number: '',
  class: '',
  stream: '',
  date_of_birth: '',
  gender: '',
  religion: '',
  nationality: '',
  previous_school: '',
  blood_group: '',
  allergies: '',
  medical_conditions: '',
  special_needs: '',
  day_boarding: '',
  status: 'active',
  date_admitted: '',
}

export function StudentForm({ form, onChange, errors }) {
  const f = form || INITIAL
  const set = (key, val) => onChange?.({ ...f, [key]: val })

  return (
    <div className="student-form">
      <p className="form-section-label">Personal Details</p>
      <div className="form-grid">
        <div className="form-field full">
          <label>Full Name *</label>
          <input
            required
            placeholder="e.g. Jane Wanjiku Kamau"
            value={f.full_name}
            onChange={e => set('full_name', e.target.value)}
          />
          {errors?.full_name && <span className="field-error">{errors.full_name}</span>}
        </div>
        <div className="form-field">
          <label>Admission Number</label>
          <input
            placeholder="Auto-generated if empty"
            value={f.admission_number}
            onChange={e => set('admission_number', e.target.value)}
          />
        </div>
        <div className="form-field">
          <label>Class *</label>
          <select required value={f.class} onChange={e => set('class', e.target.value)}>
            <option value="">Select class</option>
            {CLASSES.map(g => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map(o => <option key={o} value={o}>{o}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label>Stream</label>
          <input placeholder="e.g. East" value={f.stream} onChange={e => set('stream', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Date of Birth</label>
          <input type="date" value={f.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Gender</label>
          <select value={f.gender} onChange={e => set('gender', e.target.value)}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
        <div className="form-field">
          <label>Religion</label>
          <input placeholder="e.g. Christian" value={f.religion} onChange={e => set('religion', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Nationality</label>
          <input placeholder="e.g. Kenyan" value={f.nationality} onChange={e => set('nationality', e.target.value)} />
        </div>
        <div className="form-field full">
          <label>Previous School</label>
          <input placeholder="Previous school name" value={f.previous_school} onChange={e => set('previous_school', e.target.value)} />
        </div>
      </div>

      <p className="form-section-label">Medical Information</p>
      <div className="form-grid">
        <div className="form-field">
          <label>Blood Group</label>
          <select value={f.blood_group} onChange={e => set('blood_group', e.target.value)}>
            <option value="">Select</option>
            <option value="A+">A+</option><option value="A-">A-</option>
            <option value="B+">B+</option><option value="B-">B-</option>
            <option value="AB+">AB+</option><option value="AB-">AB-</option>
            <option value="O+">O+</option><option value="O-">O-</option>
          </select>
        </div>
        <div className="form-field">
          <label>Allergies</label>
          <input placeholder="e.g. Peanuts, Dust" value={f.allergies} onChange={e => set('allergies', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Medical Conditions</label>
          <input placeholder="e.g. Asthma" value={f.medical_conditions} onChange={e => set('medical_conditions', e.target.value)} />
        </div>
        <div className="form-field">
          <label>Special Needs</label>
          <input placeholder="e.g. Visual impairment" value={f.special_needs} onChange={e => set('special_needs', e.target.value)} />
        </div>
      </div>

      <p className="form-section-label">Student Status</p>
      <div className="form-grid">
        <div className="form-field">
          <label>Status</label>
          <select value={f.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="alumni">Alumni</option>
            <option value="transferred">Transferred</option>
          </select>
        </div>
        <div className="form-field">
          <label>Day / Boarding</label>
          <select value={f.day_boarding} onChange={e => set('day_boarding', e.target.value)}>
            <option value="">Select</option>
            <option value="day">Day Scholar</option>
            <option value="boarding">Boarding</option>
          </select>
        </div>
        <div className="form-field">
          <label>Date Admitted</label>
          <input type="date" value={f.date_admitted} onChange={e => set('date_admitted', e.target.value)} />
        </div>
      </div>
    </div>
  )
}
