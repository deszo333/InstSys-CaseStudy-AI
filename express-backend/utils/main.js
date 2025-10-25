// studentDatabase.js
const { MongoClient } = require('mongodb');
const xlsx = require('xlsx');
const fs = require('fs').promises;
const path = require('path');

// Field Status Enum
const FieldStatus = {
  COMPLETE: 'complete',
  WAITING: 'waiting',
  MISSING: 'missing'
};

const MediaDefaults = {
  IMAGE: {
    data: 'default_profile',
    filename: 'default_profile.jpg',
    path: '/images/default_profile.jpg'
  },
  AUDIO: {
    data: null,  // No default audio
    filename: null,
    path: null
  }
};

class StudentDatabase {
  constructor(connectionString = null, databaseName = 'school_system') {
  this.connectionString = connectionString || 'mongodb://localhost:27017/';
  this.databaseName = databaseName;
  this.client = null;
  this.db = null;
  
  // Department collections (NEW!)
  this.collections = {
    ccs: null,
    chtm: null,
    cba: null,
    cte: null,
    unknown: null
  };
  
  this.pendingMedia = null;
  }

  async connect() {
  try {
    this.client = new MongoClient(this.connectionString, {
      serverSelectionTimeoutMS: 5000
    });

    await this.client.connect();
    await this.client.db().admin().ping();
    console.log('✅ Connected to MongoDB successfully');

    this.db = this.client.db(this.databaseName);
    
    // Initialize department collections
    this.collections.ccs = this.db.collection('students_ccs');
    this.collections.chtm = this.db.collection('students_chtm');
    this.collections.cba = this.db.collection('students_cba');
    this.collections.cte = this.db.collection('students_cte');
    this.collections.unknown = this.db.collection('students_unknown');
    
    this.pendingMedia = this.db.collection('pending_media');

    await this._createIndexes();
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Make sure MongoDB is running:');
    console.log('      - Windows: net start MongoDB');
    console.log('      - Or run: mongod --dbpath C:\\data\\db');
    console.log('   2. Or use MongoDB Atlas (cloud): https://www.mongodb.com/cloud/atlas');
    throw error;
  }
  }

  async _createIndexes() {
  // Create indexes for each department collection
  const indexConfig = [
    { student_id: 1 },
    { surname: 1 },
    { first_name: 1 },
    { course: 1 },
    { section: 1 },
    { year: 1 },
    { course: 1, year: 1, section: 1 } // Compound index
  ];

  for (const [dept, collection] of Object.entries(this.collections)) {
    // Create unique index for student_id
    await collection.createIndex({ student_id: 1 }, { unique: true });
    
    // Create other indexes
    for (const index of indexConfig.slice(1)) {
      await collection.createIndex(index);
    }
  }

  // Pending media indexes
  await this.pendingMedia.createIndex({ student_id: 1 });
  await this.pendingMedia.createIndex({ department: 1 });
  await this.pendingMedia.createIndex({ status: 1 });
}


_getCollectionByDepartment(department) {
  const dept = (department || 'UNKNOWN').toLowerCase();
  return this.collections[dept] || this.collections.unknown;
}


  async createStudentRecord(data, source = 'file_extraction') {
  try {
    const studentDoc = {
      student_id: data.student_id || '',
      surname: data.surname || '',
      first_name: data.first_name || '',
      full_name: data.full_name || '',
      course: data.course || '',
      section: data.section || '',
      year: data.year || '',
      contact_number: data.contact_number || '',
      guardian_name: data.guardian_name || '',
      guardian_contact: data.guardian_contact || '',
      department: data.department || 'UNKNOWN',
      descriptor: data.descriptor || null,

      image: {
        data: data.image_data || null,
        filename: data.image_filename || null,
        status: source === 'file_extraction' 
          ? FieldStatus.WAITING 
          : (data.image_data ? FieldStatus.COMPLETE : FieldStatus.WAITING)
      },
      audio: {
        data: data.audio_data || null,
        filename: data.audio_filename || null,
        status: source === 'file_extraction'
          ? FieldStatus.WAITING
          : (data.audio_data ? FieldStatus.COMPLETE : FieldStatus.WAITING)
      },

      field_status: this._determineFieldStatus(data, source),
      source: source,
      created_at: new Date(),
      updated_at: new Date(),
      completion_percentage: this._calculateCompletion(data, source)
    };

    // Get the appropriate collection based on department
    const collection = this._getCollectionByDepartment(studentDoc.department);

    const result = await collection.updateOne(
      { student_id: studentDoc.student_id },
      { $set: studentDoc },
      { upsert: true }
    );

    if (studentDoc.image.status === FieldStatus.WAITING || 
        studentDoc.audio.status === FieldStatus.WAITING) {
      await this._addToPendingMedia(studentDoc);
    }

    console.log(`✅ Student record created/updated in ${studentDoc.department}: ${studentDoc.student_id}`);
    return studentDoc.student_id;

  } catch (error) {
    console.error(`❌ Error creating student record: ${error.message}`);
    return null;
  }
}

  _determineFieldStatus(data, source) {
    const fieldStatus = {};
    const textFields = ['student_id', 'surname', 'first_name', 'course', 'section', 'year'];

    textFields.forEach(field => {
      const value = data[field] || '';
      if (source === 'manual_input') {
        fieldStatus[field] = value ? FieldStatus.COMPLETE : FieldStatus.WAITING;
      } else {
        fieldStatus[field] = value ? FieldStatus.COMPLETE : FieldStatus.MISSING;
      }
    });

    fieldStatus.image = FieldStatus.WAITING;
    fieldStatus.audio = FieldStatus.WAITING;

    return fieldStatus;
  }

  _calculateCompletion(data, source) {
    const totalFields = 9;
    let completed = 0;

    const textFields = ['student_id', 'surname', 'first_name', 'course', 'section', 'year'];
  textFields.forEach(field => {
    if (data[field]) completed++;
  });

  if (data.image_data) completed++;
  if (data.audio_data) completed++;
  // Add descriptor check
  if (data.descriptor) completed++;  // ← ADD THIS LINE

  return (completed / totalFields) * 100;
}

  async _addToPendingMedia(studentDoc) {
    const pendingDoc = {
      student_id: studentDoc.student_id,
      full_name: studentDoc.full_name,
      course: studentDoc.course,
      section: studentDoc.section,
      year: studentDoc.year,
      waiting_for: {
        image: studentDoc.image.status === FieldStatus.WAITING,
        audio: studentDoc.audio.status === FieldStatus.WAITING
      },
      added_at: new Date()
    };

    await this.pendingMedia.updateOne(
      { student_id: studentDoc.student_id },
      { $set: pendingDoc },
      { upsert: true }
    );
  }

  async updateMedia(studentId, mediaType, mediaData, filename, department) {
  try {
    // Get the appropriate collection
    const collection = this._getCollectionByDepartment(department);
    
    const updateData = {
      [`${mediaType}.data`]: mediaData,
      [`${mediaType}.filename`]: filename,
      [`${mediaType}.status`]: FieldStatus.COMPLETE,
      [`field_status.${mediaType}`]: FieldStatus.COMPLETE,
      updated_at: new Date()
    };

    const result = await collection.updateOne(
      { student_id: studentId },
      { $set: updateData }
    );

    if (result.modifiedCount > 0) {
      await this._updateCompletionPercentage(studentId, department);
      await this._checkPendingMediaComplete(studentId, department);
      console.log(`✅ Updated ${mediaType} for student ${studentId}`);
      return true;
    } else {
      console.log(`⚠️ Student ${studentId} not found`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error updating media: ${error.message}`);
    return false;
  }
}

  async _updateCompletionPercentage(studentId, department) {
  const collection = this._getCollectionByDepartment(department);
  const student = await collection.findOne({ student_id: studentId });
  if (!student) return;

  const totalFields = 9;
  let completed = 0;

  const textFields = ['student_id', 'surname', 'first_name', 'course', 'section', 'year'];
  textFields.forEach(field => {
    if (student[field]) completed++;
  });

  if (student.image?.status === FieldStatus.COMPLETE) completed++;
  if (student.audio?.status === FieldStatus.COMPLETE) completed++;
  if (student.descriptor) completed++;

  const completion = (completed / totalFields) * 100;

  await collection.updateOne(
    { student_id: studentId },
    { $set: { completion_percentage: completion } }
  );
}


async updateDescriptor(studentId, descriptor, department) {
  try {
    const collection = this._getCollectionByDepartment(department);
    
    const result = await collection.updateOne(
      { student_id: studentId },
      { 
        $set: { 
          descriptor: descriptor,
          updated_at: new Date()
        } 
      }
    );

    if (result.modifiedCount > 0) {
      await this._updateCompletionPercentage(studentId, department);
      console.log(`✅ Updated descriptor for student ${studentId}`);
      return true;
    } else {
      console.log(`⚠️ Student ${studentId} not found in ${department}`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error updating descriptor: ${error.message}`);
    return false;
  }
}

  async _checkPendingMediaComplete(studentId, department) {
  const collection = this._getCollectionByDepartment(department);
  const student = await collection.findOne({ student_id: studentId });
  if (!student) return;

  const imageComplete = student.image?.status === FieldStatus.COMPLETE;
  const audioComplete = student.audio?.status === FieldStatus.COMPLETE;

  if (imageComplete && audioComplete) {
    await this.pendingMedia.deleteOne({ student_id: studentId });
    console.log(`🎉 Student ${studentId} completed all media requirements`);
  }
}

  async getPendingMediaStudents() {
    return await this.pendingMedia.find({}).toArray();
  }

  async searchStudents(query = null, filters = null) {
  const searchFilter = {};

  if (query) {
    searchFilter.$or = [
      { surname: { $regex: query, $options: 'i' } },
      { first_name: { $regex: query, $options: 'i' } },
      { full_name: { $regex: query, $options: 'i' } },
      { student_id: { $regex: query, $options: 'i' } }
    ];
  }

  if (filters) {
    Object.keys(filters).forEach(key => {
      if (key === 'year') {
        searchFilter[key] = String(filters[key]);
      } else if (key !== 'department') {
        searchFilter[key] = filters[key];
      }
    });
  }

  // If department filter is specified, search only that collection
  if (filters?.department) {
    const collection = this._getCollectionByDepartment(filters.department);
    return await collection.find(searchFilter).toArray();
  }

  // Otherwise, search all collections
  const results = [];
  for (const [dept, collection] of Object.entries(this.collections)) {
    const deptResults = await collection.find(searchFilter).toArray();
    results.push(...deptResults);
  }

  return results;
}

  async getStudentById(studentId, department = null) {
  // If department is specified, search only that collection
  if (department) {
    const collection = this._getCollectionByDepartment(department);
    return await collection.findOne({ student_id: studentId });
  }

  

  // Otherwise, search all collections
  for (const [dept, collection] of Object.entries(this.collections)) {
    const student = await collection.findOne({ student_id: studentId });
    if (student) return student;
  }

  return null;
}

  getStudentDisplay(student) {
  if (!student) return null;

  // Clone the student object to avoid modifying the original
  const displayStudent = JSON.parse(JSON.stringify(student));

  // Replace null/waiting image with default
  const imageIsEmpty = !displayStudent.image?.data || 
                       displayStudent.image?.data === null ||
                       displayStudent.image?.status === FieldStatus.WAITING;

  if (imageIsEmpty) {
    displayStudent.image = {
      data: MediaDefaults.IMAGE.data,
      filename: MediaDefaults.IMAGE.filename,
      display_path: MediaDefaults.IMAGE.path,
      status: displayStudent.image?.status || FieldStatus.WAITING,
      is_default: true
    };
  } else {
    displayStudent.image.is_default = false;
    displayStudent.image.display_path = `/images/${displayStudent.image.filename}`;
  }

  // Handle audio
  const audioIsEmpty = !displayStudent.audio?.data || 
                       displayStudent.audio?.data === null ||
                       displayStudent.audio?.status === FieldStatus.WAITING;

  if (audioIsEmpty) {
    displayStudent.audio = {
      data: MediaDefaults.AUDIO.data,
      filename: MediaDefaults.AUDIO.filename,
      display_path: MediaDefaults.AUDIO.path,
      status: displayStudent.audio?.status || FieldStatus.WAITING,
      is_default: true
    };
  } else {
    displayStudent.audio.is_default = false;
    displayStudent.audio.display_path = `/audio/${displayStudent.audio.filename}`;
  }

  return displayStudent;
}

getStudentsDisplay(students) {
  if (!students || !Array.isArray(students)) return [];
  return students.map(student => this.getStudentDisplay(student));
}


// Get student by ID with display defaults
async getStudentByIdWithDefaults(studentId, department = null) {
  const student = await this.getStudentById(studentId, department);
  return this.getStudentDisplay(student);
}

// Get multiple students with display defaults
async getStudentsWithDefaults(query = null, filters = null) {
  const students = await this.searchStudents(query, filters);
  return students.map(student => this.getStudentDisplay(student));
}


  async getStatistics() {
  let totalStudents = 0;
  const byDepartment = {};

  // Get counts from each department collection
  for (const [dept, collection] of Object.entries(this.collections)) {
    const count = await collection.countDocuments({});
    totalStudents += count;
    if (count > 0) {
      byDepartment[dept.toUpperCase()] = count;
    }
  }

  const pendingMedia = await this.pendingMedia.countDocuments({});

  // Calculate average completion across all departments
  let totalCompletion = 0;
  let studentCount = 0;

  for (const collection of Object.values(this.collections)) {
    const avgResult = await collection.aggregate([
      {
        $group: {
          _id: null,
          avg_completion: { $avg: '$completion_percentage' },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    if (avgResult.length > 0) {
      totalCompletion += avgResult[0].avg_completion * avgResult[0].count;
      studentCount += avgResult[0].count;
    }
  }

  const avgCompletion = studentCount > 0 ? totalCompletion / studentCount : 0;

  return {
    total_students: totalStudents,
    pending_media: pendingMedia,
    average_completion: Math.round(avgCompletion * 100) / 100,
    by_department: byDepartment
  };
}

  async viewAllStudents(limit = 50, department = null) {
  if (department) {
    const collection = this._getCollectionByDepartment(department);
    return await collection.find({}).limit(limit).toArray();
  }

  // Get from all departments
  const results = [];
  for (const collection of Object.values(this.collections)) {
    const students = await collection.find({}).limit(limit).toArray();
    results.push(...students);
    if (results.length >= limit) break;
  }

  return results.slice(0, limit);
}

  async viewStudentDetails(studentId) {
    return await this.students.findOne({ student_id: studentId });
  }

  async exportToDict() {
    return {
      students: await this.students.find({}).toArray(),
      pending_media: await this.pendingMedia.find({}).toArray()
    };
  }

  async clearAllData() {
  // Clear all department collections
  for (const collection of Object.values(this.collections)) {
    await collection.deleteMany({});
  }
  await this.pendingMedia.deleteMany({});
  console.log('🗑️ All data cleared from all department collections');
}

async getStudentsByDepartment(department) {
  const collection = this._getCollectionByDepartment(department);
  return await collection.find({}).sort({ 
    course: 1, 
    year: 1, 
    section: 1,
    surname: 1 
  }).toArray();
}

async getDepartmentStatistics(department) {
  const collection = this._getCollectionByDepartment(department);
  
  const totalStudents = await collection.countDocuments({});
  
  const avgResult = await collection.aggregate([
    {
      $group: {
        _id: null,
        avg_completion: { $avg: '$completion_percentage' }
      }
    }
  ]).toArray();

  const avgCompletion = avgResult.length > 0 ? avgResult[0].avg_completion : 0;

  // By course
  const byCourse = await collection.aggregate([
    {
      $group: {
        _id: { course: '$course', year: '$year', section: '$section' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.course': 1, '_id.year': 1, '_id.section': 1 }
    }
  ]).toArray();

  return {
    department: department.toUpperCase(),
    total_students: totalStudents,
    average_completion: Math.round(avgCompletion * 100) / 100,
    by_course: byCourse
  };
}

  async close() {
    if (this.client) {
      await this.client.close();
    }
  }
}

class StudentDataExtractor {
  static async processExcel(filePath, db) {
    try {
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);

      const columnMapping = {
        'student id': 'student_id',
        'id no': 'student_id',
        'id': 'student_id',
        'full name': 'full_name',
        'name': 'full_name',
        'surname': 'surname',
        'first name': 'first_name',
        'year': 'year',
        'course': 'course',
        'section': 'section',
        'contact number': 'contact_number',
        'guardian name': 'guardian_name',
        'guardian contact': 'guardian_contact'
      };

      let processedCount = 0;

      for (const row of data) {
        const studentData = {};

        const normalizedRow = {};
        Object.keys(row).forEach(key => {
          normalizedRow[key.toLowerCase().trim()] = row[key];
        });

        Object.keys(columnMapping).forEach(colHeader => {
          const dataKey = columnMapping[colHeader];
          if (normalizedRow[colHeader] !== undefined && normalizedRow[colHeader] !== null) {
            const rawValue = String(normalizedRow[colHeader]).trim();
            if (rawValue && !['nan', '', 'null'].includes(rawValue.toLowerCase())) {
              studentData[dataKey] = this.cleanValue(rawValue, dataKey);
            }
          }
        });

        if (studentData.course) {
          studentData.department = this.detectDepartment(studentData.course);
        }

        if (!studentData.full_name && studentData.surname && studentData.first_name) {
          studentData.full_name = `${studentData.surname}, ${studentData.first_name}`;
        }

        if (studentData.student_id || studentData.full_name) {
          const result = await db.createStudentRecord(studentData, 'file_extraction');
          if (result) processedCount++;
        }
      }

      console.log(`📊 Processed ${processedCount} students from Excel`);
      return processedCount > 0;

    } catch (error) {
      console.error(`❌ Error processing Excel: ${error.message}`);
      return false;
    }
  }

  static cleanValue(value, fieldType) {
    if (!value) return null;

    value = value.trim();

    if (fieldType === 'student_id') {
      return value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    } else if (['contact_number', 'guardian_contact'].includes(fieldType)) {
      const cleaned = value.replace(/[^\d+]/g, '');
      return (cleaned.length >= 7 && cleaned.length <= 15) ? cleaned : null;
    } else if (['full_name', 'guardian_name', 'surname', 'first_name'].includes(fieldType)) {
      return value.replace(/[^A-Za-z\s.,-]/g, '').split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    } else if (fieldType === 'year') {
      const yearMatch = value.match(/([1-4])/);
      return yearMatch ? yearMatch[1] : null;
    } else if (['course', 'section'].includes(fieldType)) {
      return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    return value;
  }

  static detectDepartment(courseCode) {
    if (!courseCode) return 'UNKNOWN';

    const courseUpper = String(courseCode).toUpperCase().trim();

    const knownCourses = {
      'CCS': ['BSCS', 'BSIT'],
      'CHTM': ['BSHM', 'BSTM'],
      'CBA': ['BSBA', 'BSOA'],
      'CTE': ['BECED', 'BTLE']
    };

    for (const [dept, courses] of Object.entries(knownCourses)) {
      if (courses.includes(courseUpper)) {
        return dept;
      }
    }

    return 'UNKNOWN';
  }
}

class CORScheduleManager {
  constructor(db) {
    this.db = db;
  }



  /**
   * Store COR schedule in department-specific collection
   */
  async storeCORSchedule(corData) {
  try {
    const dept = (corData.metadata.department || 'UNKNOWN').toLowerCase();
    
    // Get the schedules collection for this department
    const collection = this.db.db.collection(`schedules_${dept}`);
    
    const scheduleDoc = {
      // Identification
      schedule_id: `COR_${corData.metadata.department}_${corData.metadata.course}_Y${corData.metadata.year}_${corData.metadata.section}_${Date.now()}`,
      
      // Program Information
      course: corData.metadata.course,
      section: corData.metadata.section,
      year: corData.metadata.year,  // ← CHANGED from year_level
      adviser: corData.metadata.adviser,
      department: corData.metadata.department,
      
      // Schedule Summary
      total_units: corData.metadata.total_units,
      subject_count: corData.metadata.subject_count,
      subject_codes: corData.metadata.subject_codes,
      
      // Detailed Schedule (array of subjects)
      subjects: corData.cor_info.schedule,
      
      // Full formatted text
      formatted_text: corData.formatted_text,
      
      // Metadata
      source_file: corData.metadata.source_file,
      data_type: 'cor_schedule',
      created_at: corData.metadata.created_at,
      updated_at: new Date()
    };

    // Insert the document
    const result = await collection.insertOne(scheduleDoc);

    console.log(`✅ COR schedule stored in: schedules_${dept}`);
    console.log(`   Schedule ID: ${scheduleDoc.schedule_id}`);
    console.log(`   MongoDB _id: ${result.insertedId}`);
    
    return scheduleDoc.schedule_id;

  } catch (error) {
    console.error(`❌ Error storing COR: ${error.message}`);
    return null;
  }
}

  /**
 * Get COR schedules with filters
 */
async getCORSchedules(filters = {}) {
  try {
    const query = { data_type: 'cor_schedule' };
    
    // Build query based on filters
    if (filters.department) {
      query.department = filters.department;
    }
    if (filters.course) {
      query.course = filters.course;
    }
    if (filters.year) {
      query.year = String(filters.year);
    }
    if (filters.section) {
      query.section = filters.section;
    }

    // If department filter is specified, search only that collection
    if (filters.department) {
      const dept = filters.department.toLowerCase();
      const collection = this.db.db.collection(`schedules_${dept}`);
      return await collection.find(query).toArray();
    }

    // Otherwise, search all department collections
    const departments = ['ccs', 'chtm', 'cba', 'cte', 'unknown'];
    const allSchedules = [];

    for (const dept of departments) {
      try {
        const collection = this.db.db.collection(`schedules_${dept}`);
        const schedules = await collection.find(query).toArray();
        allSchedules.push(...schedules);
      } catch {
        // Collection might not exist yet
        continue;
      }
    }

    return allSchedules;
  } catch (error) {
    console.error(`❌ Error getting COR schedules: ${error.message}`);
    return [];
  }
}

  /**
   * Get all COR schedules from all departments
   */
  async getAllCORSchedules() {
    try {
      const departments = ['ccs', 'chtm', 'cba', 'cte', 'unknown'];
      const allSchedules = [];

      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`schedules_${dept}`);
          const schedules = await collection.find({ data_type: 'cor_schedule' }).toArray();
          allSchedules.push(...schedules);
        } catch {
          // Collection might not exist yet
          continue;
        }
      }

      return allSchedules;
    } catch (error) {
      console.error(`❌ Error getting all COR schedules: ${error.message}`);
      return [];
    }
  }

  /**
   * Get COR statistics
   */
  async getCORStatistics() {
    try {
      const allSchedules = await this.getAllCORSchedules();
      
      const stats = {
        total_schedules: allSchedules.length,
        by_department: {},
        by_course: {},
        total_subjects: 0,
        total_units: 0
      };

      allSchedules.forEach(schedule => {
        // By department
        const dept = schedule.department || 'UNKNOWN';
        stats.by_department[dept] = (stats.by_department[dept] || 0) + 1;

        // By course
        const course = schedule.course || 'UNKNOWN';
        stats.by_course[course] = (stats.by_course[course] || 0) + 1;

        // Totals
        stats.total_subjects += parseInt(schedule.subject_count) || 0;
        stats.total_units += parseFloat(schedule.total_units) || 0;
      });

      return stats;
    } catch (error) {
      console.error(`❌ Error getting COR statistics: ${error.message}`);
      return null;
    }
  }
}

class StudentGradesManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Store student grades (only if student exists)
   */
  async storeStudentGrades(gradesData) {
  try {
    const studentNumber = gradesData.metadata.student_number;
    
    // CRITICAL: Check if student exists first
    const existingStudent = await this.db.getStudentById(studentNumber);
    
    if (!existingStudent) {
      console.log(`❌ Student ${studentNumber} NOT FOUND in database`);
      console.log(`   ⚠️  Student must be imported first before adding grades`);
      return { success: false, reason: 'student_not_found' };
    }

    console.log(`✅ Student ${studentNumber} exists: ${existingStudent.full_name}`);

    // Store grades in the student's department collection
    const dept = (existingStudent.department || 'UNKNOWN').toLowerCase();
    const collection = this.db.db.collection(`grades_${dept}`);

    const gradesDoc = {
      student_id: studentNumber,
      student_name: gradesData.metadata.student_name,
      full_name: existingStudent.full_name,
      course: gradesData.metadata.course || existingStudent.course,
      department: existingStudent.department,
      year: existingStudent.year,  // ← CHANGED from year_level
      section: existingStudent.section,
      
      // Grades data
      gwa: gradesData.metadata.gwa,
      total_subjects: gradesData.metadata.total_subjects,
      grades: gradesData.grades_info.grades,
      
      // Metadata
      source_file: gradesData.metadata.source_file,
      data_type: 'student_grades',
      created_at: gradesData.metadata.created_at,
      updated_at: new Date()
    };

    // Check if grades already exist for this student
    const existing = await collection.findOne({ student_id: studentNumber });
    
    if (existing) {
      // Update existing grades
      await collection.updateOne(
        { student_id: studentNumber },
        { $set: gradesDoc }
      );
      console.log(`✅ Updated grades for ${studentNumber} in grades_${dept}`);
    } else {
      // Insert new grades
      await collection.insertOne(gradesDoc);
      console.log(`✅ Stored grades for ${studentNumber} in grades_${dept}`);
    }

    return { success: true, department: dept };

  } catch (error) {
    console.error(`❌ Error storing grades: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

  /**
   * Get student grades
   */
  async getStudentGrades(studentId, department = null) {
    try {
      if (department) {
        const collection = this.db.db.collection(`grades_${department.toLowerCase()}`);
        return await collection.findOne({ student_id: studentId });
      }

      // Search all department collections
      const departments = ['ccs', 'chtm', 'cba', 'cte', 'unknown'];
      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`grades_${dept}`);
          const grades = await collection.findOne({ student_id: studentId });
          if (grades) return grades;
        } catch {
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error(`❌ Error getting grades: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear all grades
   */
  async clearAllGrades() {
    try {
      const departments = ['ccs', 'chtm', 'cba', 'cte', 'unknown'];
      let totalCleared = 0;

      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`grades_${dept}`);
          const result = await collection.deleteMany({ data_type: 'student_grades' });
          
          if (result.deletedCount > 0) {
            console.log(`   Cleared ${result.deletedCount} grade record(s) from grades_${dept}`);
            totalCleared += result.deletedCount;
          }
        } catch {
          continue;
        }
      }

      if (totalCleared > 0) {
        console.log(`✅ Total grade records cleared: ${totalCleared}`);
      }
    } catch (error) {
      console.error(`❌ Error clearing grades: ${error.message}`);
    }
  }
}

class TeachingFacultyManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Store teaching faculty in department-specific collection
   */
  async storeTeachingFaculty(facultyData) {
  try {
    const dept = (facultyData.metadata.department || 'UNKNOWN').toLowerCase();
    
    // Get the faculty collection for this department
    const collection = this.db.db.collection(`faculty_${dept}`);
    
    const facultyDoc = {
      // Identification
      faculty_id: `FACULTY_${facultyData.metadata.department}_${Date.now()}`,
      full_name: facultyData.metadata.full_name,
      surname: facultyData.metadata.surname,
      first_name: facultyData.metadata.first_name,
      
      // Personal Information
      date_of_birth: facultyData.faculty_info.date_of_birth,
      place_of_birth: facultyData.faculty_info.place_of_birth,
      citizenship: facultyData.faculty_info.citizenship,
      sex: facultyData.faculty_info.sex,
      height: facultyData.faculty_info.height,
      weight: facultyData.faculty_info.weight,
      blood_type: facultyData.faculty_info.blood_type,
      religion: facultyData.faculty_info.religion,
      civil_status: facultyData.faculty_info.civil_status,
      
      // Contact Information
      address: facultyData.faculty_info.address,
      zip_code: facultyData.faculty_info.zip_code,
      phone: facultyData.faculty_info.phone,
      email: facultyData.faculty_info.email,
      
      // Professional Information
      position: facultyData.metadata.position,
      department: facultyData.metadata.department,
      employment_status: facultyData.metadata.employment_status,
      
      // ← ADD THIS: Biometric descriptor
      descriptor: facultyData.faculty_info.descriptor || null,
      
      // ← ADD THIS: Media fields (image and audio)
      image: {
        data: null,
        filename: null,
        status: 'waiting'  // waiting for upload
      },
      audio: {
        data: null,
        filename: null,
        status: 'waiting'  // waiting for upload
      },
      
      // Family Information
      family_info: {
        father: {
          name: facultyData.faculty_info.father_name,
          date_of_birth: facultyData.faculty_info.father_dob,
          occupation: facultyData.faculty_info.father_occupation
        },
        mother: {
          name: facultyData.faculty_info.mother_name,
          date_of_birth: facultyData.faculty_info.mother_dob,
          occupation: facultyData.faculty_info.mother_occupation
        },
        spouse: {
          name: facultyData.faculty_info.spouse_name,
          date_of_birth: facultyData.faculty_info.spouse_dob,
          occupation: facultyData.faculty_info.spouse_occupation
        }
      },
      
      // Government IDs
      government_ids: {
        gsis: facultyData.faculty_info.gsis,
        philhealth: facultyData.faculty_info.philhealth
      },
      
      // Field status tracking
      field_status: {
        personal_info: 'complete',
        contact_info: 'complete',
        professional_info: 'complete',
        image: 'waiting',
        audio: 'waiting',
        descriptor: facultyData.faculty_info.descriptor ? 'complete' : 'waiting'
      },
      
      // Completion percentage
      completion_percentage: this._calculateTeachingFacultyCompletion(facultyData),
      
      // Full formatted text for display
      formatted_text: facultyData.formatted_text,
      
      // Metadata
      source_file: facultyData.metadata.source_file,
      data_type: 'teaching_faculty',
      faculty_type: 'teaching',
      created_at: facultyData.metadata.created_at,
      updated_at: new Date()
    };
    
    // Insert the document
    const result = await collection.insertOne(facultyDoc);
    
    // ← ADD THIS: Add to pending media if waiting for image/audio
    await this._addTeachingToPendingMedia(facultyDoc);
    
    console.log(`✅ Teaching faculty stored in: faculty_${dept}`);
    console.log(`   Faculty ID: ${facultyDoc.faculty_id}`);
    console.log(`   Completion: ${facultyDoc.completion_percentage.toFixed(1)}%`);
    console.log(`   MongoDB _id: ${result.insertedId}`);
    
    return facultyDoc.faculty_id;
    
  } catch (error) {
    console.error(`❌ Error storing teaching faculty: ${error.message}`);
    return null;
  }
}

  /**
 * Calculate completion percentage for teaching faculty
 */
_calculateTeachingFacultyCompletion(facultyData) {
  const totalFields = 9; // personal + contact + professional + image + audio + descriptor
  let completed = 0;

  // Personal info (if has surname and first name)
  if (facultyData.faculty_info.surname && facultyData.faculty_info.first_name) {
    completed++;
  }

  // Contact info (if has phone or email)
  if (facultyData.faculty_info.phone || facultyData.faculty_info.email) {
    completed++;
  }

  // Professional info (if has position and department)
  if (facultyData.metadata.position && facultyData.metadata.department) {
    completed++;
  }

  // Address
  if (facultyData.faculty_info.address) {
    completed++;
  }

  // GSIS or PhilHealth
  if (facultyData.faculty_info.gsis || facultyData.faculty_info.philhealth) {
    completed++;
  }

  // Civil Status
  if (facultyData.faculty_info.civil_status) {
    completed++;
  }

  // Image (not yet uploaded, so doesn't count)
  // Audio (not yet uploaded, so doesn't count)
  // Descriptor (check if exists)
  if (facultyData.faculty_info.descriptor) {
    completed++;
  }

  return (completed / totalFields) * 100;
}

/**
 * Add teaching faculty to pending media collection
 */
async _addTeachingToPendingMedia(facultyDoc) {
  try {
    const pendingDoc = {
      faculty_id: facultyDoc.faculty_id,
      full_name: facultyDoc.full_name,
      position: facultyDoc.position,
      department: facultyDoc.department,
      faculty_type: 'teaching',
      waiting_for: {
        image: facultyDoc.image.status === 'waiting',
        audio: facultyDoc.audio.status === 'waiting',
        descriptor: !facultyDoc.descriptor
      },
      added_at: new Date()
    };

    await this.db.db.collection('pending_media').updateOne(
      { faculty_id: facultyDoc.faculty_id },
      { $set: pendingDoc },
      { upsert: true }
    );

    console.log(`   📝 Added to pending media queue`);
  } catch (error) {
    console.error(`   ⚠️  Error adding to pending media: ${error.message}`);
  }
}

/**
 * Update teaching faculty media (image or audio)
 */
async updateTeachingMedia(facultyId, mediaType, mediaData, filename, department) {
  try {
    const dept = department.toLowerCase();
    const collection = this.db.db.collection(`faculty_${dept}`);

    const updateData = {
      [`${mediaType}.data`]: mediaData,
      [`${mediaType}.filename`]: filename,
      [`${mediaType}.status`]: 'complete',
      [`field_status.${mediaType}`]: 'complete',
      updated_at: new Date()
    };

    const result = await collection.updateOne(
      { faculty_id: facultyId },
      { $set: updateData }
    );

    if (result.modifiedCount > 0) {
      await this._updateTeachingCompletion(facultyId, department);
      await this._checkTeachingMediaComplete(facultyId, department);
      console.log(`✅ Updated ${mediaType} for teaching faculty ${facultyId}`);
      return true;
    } else {
      console.log(`⚠️  Teaching faculty ${facultyId} not found`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error updating teaching media: ${error.message}`);
    return false;
  }
}

/**
 * Update teaching faculty descriptor
 */
async updateTeachingDescriptor(facultyId, descriptor, department) {
  try {
    const dept = department.toLowerCase();
    const collection = this.db.db.collection(`faculty_${dept}`);

    const result = await collection.updateOne(
      { faculty_id: facultyId },
      { 
        $set: { 
          descriptor: descriptor,
          'field_status.descriptor': 'complete',
          updated_at: new Date()
        } 
      }
    );

    if (result.modifiedCount > 0) {
      await this._updateTeachingCompletion(facultyId, department);
      console.log(`✅ Updated descriptor for teaching faculty ${facultyId}`);
      return true;
    } else {
      console.log(`⚠️  Teaching faculty ${facultyId} not found`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error updating teaching descriptor: ${error.message}`);
    return false;
  }
}

/**
 * Update completion percentage for teaching faculty
 */
async _updateTeachingCompletion(facultyId, department) {
  try {
    const dept = department.toLowerCase();
    const collection = this.db.db.collection(`faculty_${dept}`);
    const faculty = await collection.findOne({ faculty_id: facultyId });
    
    if (!faculty) return;

    const totalFields = 9;
    let completed = 0;

    // Check each field
    if (faculty.surname && faculty.first_name) completed++;
    if (faculty.phone || faculty.email) completed++;
    if (faculty.position && faculty.department) completed++;
    if (faculty.address) completed++;
    if (faculty.government_ids?.gsis || faculty.government_ids?.philhealth) completed++;
    if (faculty.civil_status) completed++;
    if (faculty.image?.status === 'complete') completed++;
    if (faculty.audio?.status === 'complete') completed++;
    if (faculty.descriptor) completed++;

    const completion = (completed / totalFields) * 100;

    await collection.updateOne(
      { faculty_id: facultyId },
      { $set: { completion_percentage: completion } }
    );
  } catch (error) {
    console.error(`❌ Error updating teaching completion: ${error.message}`);
  }
}

/**
 * Check if teaching faculty media is complete and remove from pending
 */
async _checkTeachingMediaComplete(facultyId, department) {
  try {
    const dept = department.toLowerCase();
    const collection = this.db.db.collection(`faculty_${dept}`);
    const faculty = await collection.findOne({ faculty_id: facultyId });
    
    if (!faculty) return;

    const imageComplete = faculty.image?.status === 'complete';
    const audioComplete = faculty.audio?.status === 'complete';
    const descriptorComplete = !!faculty.descriptor;

    if (imageComplete && audioComplete && descriptorComplete) {
      await this.db.db.collection('pending_media').deleteOne({ faculty_id: facultyId });
      console.log(`   🎉 Teaching faculty ${facultyId} completed all media requirements`);
    }
  } catch (error) {
    console.error(`❌ Error checking teaching media completion: ${error.message}`);
  }
}

/**
 * Get teaching faculty pending media
 */
async getTeachingPendingMedia() {
  try {
    return await this.db.db.collection('pending_media').find({ 
      faculty_type: 'teaching' 
    }).toArray();
  } catch (error) {
    console.error(`❌ Error getting teaching pending media: ${error.message}`);
    return [];
  }
}

  /**
   * Get all teaching faculty from all departments
   */
  async getAllTeachingFaculty() {
    try {
      const departments = ['cas', 'ccs', 'chtm', 'cba', 'cte', 'coe', 'con', 'admin', 'unknown'];
      const allFaculty = [];

      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`faculty_${dept}`);
          const faculty = await collection.find({ data_type: 'teaching_faculty' }).toArray();
          allFaculty.push(...faculty);
        } catch {
          // Collection might not exist yet
          continue;
        }
      }

      return allFaculty;
    } catch (error) {
      console.error(`❌ Error getting all teaching faculty: ${error.message}`);
      return [];
    }
  }

  /**
   * Get teaching faculty by department
   */
  async getTeachingFacultyByDepartment(department) {
    try {
      const dept = department.toLowerCase();
      const collection = this.db.db.collection(`faculty_${dept}`);
      return await collection.find({ data_type: 'teaching_faculty' }).toArray();
    } catch (error) {
      console.error(`❌ Error getting teaching faculty: ${error.message}`);
      return [];
    }
  }

  /**
   * Get teaching faculty statistics
   */
  async getTeachingFacultyStatistics() {
    try {
      const allFaculty = await this.getAllTeachingFaculty();
      
      const stats = {
        total_faculty: allFaculty.length,
        by_department: {},
        by_position: {},
        by_employment_status: {}
      };

      allFaculty.forEach(faculty => {
        // By department
        const dept = faculty.department || 'UNKNOWN';
        stats.by_department[dept] = (stats.by_department[dept] || 0) + 1;

        // By position
        const position = faculty.position || 'UNKNOWN';
        stats.by_position[position] = (stats.by_position[position] || 0) + 1;

        // By employment status
        const status = faculty.employment_status || 'UNKNOWN';
        stats.by_employment_status[status] = (stats.by_employment_status[status] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error(`❌ Error getting teaching faculty statistics: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear all teaching faculty
   */
  async clearAllTeachingFaculty() {
    try {
      const departments = ['cas', 'ccs', 'chtm', 'cba', 'cte', 'coe', 'con', 'admin', 'unknown'];
      let totalCleared = 0;

      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`faculty_${dept}`);
          const result = await collection.deleteMany({ data_type: 'teaching_faculty' });
          
          if (result.deletedCount > 0) {
            console.log(`   Cleared ${result.deletedCount} faculty record(s) from faculty_${dept}`);
            totalCleared += result.deletedCount;
          }
        } catch {
          continue;
        }
      }

      if (totalCleared > 0) {
        console.log(`✅ Total teaching faculty records cleared: ${totalCleared}`);
      }
    } catch (error) {
      console.error(`❌ Error clearing teaching faculty: ${error.message}`);
    }
  }
}

class TeachingFacultyScheduleManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Store teaching faculty schedule in department-specific collection
   */
  async storeTeachingFacultySchedule(scheduleData) {
    try {
      const dept = (scheduleData.metadata.department || 'UNKNOWN').toLowerCase();
      
      // Get the faculty schedule collection for this department
      const collection = this.db.db.collection(`faculty_schedules_${dept}`);
      
      const scheduleDoc = {
        // Identification
        schedule_id: `FACULTY_SCHED_${scheduleData.metadata.department}_${Date.now()}`,
        adviser_name: scheduleData.metadata.adviser_name,
        full_name: scheduleData.metadata.full_name,
        department: scheduleData.metadata.department,
        
        // Schedule Summary
        total_subjects: scheduleData.metadata.total_subjects,
        days_teaching: scheduleData.metadata.days_teaching,
        
        // Detailed Schedule (array of classes)
        schedule: scheduleData.schedule_info.schedule,
        
        // Full formatted text
        formatted_text: scheduleData.formatted_text,
        
        // Metadata
        source_file: scheduleData.metadata.source_file,
        data_type: 'teaching_faculty_schedule',
        faculty_type: 'schedule',
        created_at: scheduleData.metadata.created_at,
        updated_at: new Date()
      };
      
      // Insert the document
      const result = await collection.insertOne(scheduleDoc);
      
      console.log(`✅ Teaching faculty schedule stored in: faculty_schedules_${dept}`);
      console.log(`   Schedule ID: ${scheduleDoc.schedule_id}`);
      console.log(`   MongoDB _id: ${result.insertedId}`);
      
      return scheduleDoc.schedule_id;
      
    } catch (error) {
      console.error(`❌ Error storing teaching faculty schedule: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all teaching faculty schedules from all departments
   */
  async getAllTeachingFacultySchedules() {
    try {
      const departments = ['cas', 'ccs', 'chtm', 'cba', 'cte', 'coe', 'con', 'admin', 'unknown'];
      const allSchedules = [];

      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`faculty_schedules_${dept}`);
          const schedules = await collection.find({ data_type: 'teaching_faculty_schedule' }).toArray();
          allSchedules.push(...schedules);
        } catch {
          // Collection might not exist yet
          continue;
        }
      }

      return allSchedules;
    } catch (error) {
      console.error(`❌ Error getting all teaching faculty schedules: ${error.message}`);
      return [];
    }
  }

  /**
   * Get teaching faculty schedules by department
   */
  async getTeachingFacultySchedulesByDepartment(department) {
    try {
      const dept = department.toLowerCase();
      const collection = this.db.db.collection(`faculty_schedules_${dept}`);
      return await collection.find({ data_type: 'teaching_faculty_schedule' }).toArray();
    } catch (error) {
      console.error(`❌ Error getting teaching faculty schedules: ${error.message}`);
      return [];
    }
  }

  /**
   * Get teaching faculty schedule statistics
   */
  async getTeachingFacultyScheduleStatistics() {
    try {
      const allSchedules = await this.getAllTeachingFacultySchedules();
      
      const stats = {
        total_schedules: allSchedules.length,
        total_faculty: allSchedules.length,
        total_classes: 0,
        by_department: {},
        by_days_teaching: {}
      };

      allSchedules.forEach(schedule => {
        // By department
        const dept = schedule.department || 'UNKNOWN';
        stats.by_department[dept] = (stats.by_department[dept] || 0) + 1;

        // Total classes
        stats.total_classes += schedule.total_subjects || 0;

        // By days teaching
        const days = schedule.days_teaching || 0;
        stats.by_days_teaching[days] = (stats.by_days_teaching[days] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error(`❌ Error getting teaching faculty schedule statistics: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear all teaching faculty schedules
   */
  async clearAllTeachingFacultySchedules() {
    try {
      // Get ALL collections in the database
      const collections = await this.db.db.listCollections().toArray();
      
      let totalCleared = 0;

      // Find all collections that start with 'faculty_schedules_'
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        
        // Check if this is a faculty schedule collection
        if (collectionName.startsWith('faculty_schedules_')) {
          try {
            const collection = this.db.db.collection(collectionName);
            const result = await collection.deleteMany({ data_type: 'teaching_faculty_schedule' });
            
            if (result.deletedCount > 0) {
              console.log(`   Cleared ${result.deletedCount} faculty schedule(s) from ${collectionName}`);
              totalCleared += result.deletedCount;
            }
          } catch (error) {
            console.error(`   ⚠️  Error clearing ${collectionName}: ${error.message}`);
            continue;
          }
        }
      }

      if (totalCleared > 0) {
        console.log(`✅ Total teaching faculty schedules cleared: ${totalCleared}`);
      } else {
        console.log('ℹ️  No teaching faculty schedules to clear');
      }
    } catch (error) {
      console.error(`❌ Error clearing teaching faculty schedules: ${error.message}`);
    }
  }
}

class NonTeachingFacultyManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Store non-teaching faculty in department-specific collection
   */
  async storeNonTeachingFaculty(facultyData) {
  try {
    const dept = (facultyData.metadata.department || 'ADMIN_SUPPORT').toLowerCase();
    
    // Get the non-teaching faculty collection for this department
    const collection = this.db.db.collection(`non_teaching_faculty_${dept}`);
    
    const facultyDoc = {
      // Identification
      faculty_id: `NON_TEACHING_${facultyData.metadata.department}_${Date.now()}`,
      full_name: facultyData.metadata.full_name,
      surname: facultyData.metadata.surname,
      first_name: facultyData.metadata.first_name,
      
      // Personal Information
      date_of_birth: facultyData.faculty_info.date_of_birth,
      place_of_birth: facultyData.faculty_info.place_of_birth,
      citizenship: facultyData.faculty_info.citizenship,
      sex: facultyData.faculty_info.sex,
      height: facultyData.faculty_info.height,
      weight: facultyData.faculty_info.weight,
      blood_type: facultyData.faculty_info.blood_type,
      religion: facultyData.faculty_info.religion,
      civil_status: facultyData.faculty_info.civil_status,
      
      // Contact Information
      address: facultyData.faculty_info.address,
      zip_code: facultyData.faculty_info.zip_code,
      phone: facultyData.faculty_info.phone,
      email: facultyData.faculty_info.email,
      
      // Professional Information
      position: facultyData.metadata.position,
      department: facultyData.metadata.department,
      employment_status: facultyData.metadata.employment_status,
      
      // ← ADD THIS: Biometric descriptor
      descriptor: facultyData.faculty_info.descriptor || null,
      
      // ← ADD THIS: Media fields (image and audio)
      image: {
        data: null,
        filename: null,
        status: 'waiting'  // waiting for upload
      },
      audio: {
        data: null,
        filename: null,
        status: 'waiting'  // waiting for upload
      },
      
      // Family Information
      family_info: {
        father: {
          name: facultyData.faculty_info.father_name,
          date_of_birth: facultyData.faculty_info.father_dob,
          occupation: facultyData.faculty_info.father_occupation
        },
        mother: {
          name: facultyData.faculty_info.mother_name,
          date_of_birth: facultyData.faculty_info.mother_dob,
          occupation: facultyData.faculty_info.mother_occupation
        },
        spouse: {
          name: facultyData.faculty_info.spouse_name,
          date_of_birth: facultyData.faculty_info.spouse_dob,
          occupation: facultyData.faculty_info.spouse_occupation
        }
      },
      
      // Government IDs
      government_ids: {
        gsis: facultyData.faculty_info.gsis,
        philhealth: facultyData.faculty_info.philhealth
      },
      
      //Field status tracking
      field_status: {
        personal_info: 'complete',
        contact_info: 'complete',
        professional_info: 'complete',
        image: 'waiting',
        audio: 'waiting',
        descriptor: facultyData.faculty_info.descriptor ? 'complete' : 'waiting'
      },
      
      // Completion percentage
      completion_percentage: this._calculateNonTeachingFacultyCompletion(facultyData),
      
      // Full formatted text for display
      formatted_text: facultyData.formatted_text,
      
      // Metadata
      source_file: facultyData.metadata.source_file,
      data_type: 'non_teaching_faculty',
      faculty_type: 'non_teaching',
      created_at: facultyData.metadata.created_at,
      updated_at: new Date()
    };
    
    // Insert the document
    const result = await collection.insertOne(facultyDoc);
    
    // ← ADD THIS: Add to pending media if waiting for image/audio
    await this._addNonTeachingToPendingMedia(facultyDoc);
    
    console.log(`✅ Non-teaching faculty stored in: non_teaching_faculty_${dept}`);
    console.log(`   Faculty ID: ${facultyDoc.faculty_id}`);
    console.log(`   Completion: ${facultyDoc.completion_percentage.toFixed(1)}%`);
    console.log(`   MongoDB _id: ${result.insertedId}`);
    
    return facultyDoc.faculty_id;
    
  } catch (error) {
    console.error(`❌ Error storing non-teaching faculty: ${error.message}`);
    return null;
  }
}

  /**
 * Calculate completion percentage for non-teaching faculty
 */
_calculateNonTeachingFacultyCompletion(facultyData) {
  const totalFields = 9; // personal + contact + professional + image + audio + descriptor
  let completed = 0;

  // Personal info (if has surname and first name)
  if (facultyData.faculty_info.surname && facultyData.faculty_info.first_name) {
    completed++;
  }

  // Contact info (if has phone or email)
  if (facultyData.faculty_info.phone || facultyData.faculty_info.email) {
    completed++;
  }

  // Professional info (if has position and department)
  if (facultyData.metadata.position && facultyData.metadata.department) {
    completed++;
  }

  // Address
  if (facultyData.faculty_info.address) {
    completed++;
  }

  // GSIS or PhilHealth
  if (facultyData.faculty_info.gsis || facultyData.faculty_info.philhealth) {
    completed++;
  }

  // Civil Status
  if (facultyData.faculty_info.civil_status) {
    completed++;
  }

  // Image (not yet uploaded, so doesn't count)
  // Audio (not yet uploaded, so doesn't count)
  // Descriptor (check if exists)
  if (facultyData.faculty_info.descriptor) {
    completed++;
  }

  return (completed / totalFields) * 100;
}

/**
 * Add non-teaching faculty to pending media collection
 */
async _addNonTeachingToPendingMedia(facultyDoc) {
  try {
    const pendingDoc = {
      faculty_id: facultyDoc.faculty_id,
      full_name: facultyDoc.full_name,
      position: facultyDoc.position,
      department: facultyDoc.department,
      faculty_type: 'non_teaching',
      waiting_for: {
        image: facultyDoc.image.status === 'waiting',
        audio: facultyDoc.audio.status === 'waiting',
        descriptor: !facultyDoc.descriptor
      },
      added_at: new Date()
    };

    await this.db.db.collection('pending_media').updateOne(
      { faculty_id: facultyDoc.faculty_id },
      { $set: pendingDoc },
      { upsert: true }
    );

    console.log(`   📝 Added to pending media queue`);
  } catch (error) {
    console.error(`   ⚠️  Error adding to pending media: ${error.message}`);
  }
}

/**
 * Update non-teaching faculty media (image or audio)
 */
async updateNonTeachingMedia(facultyId, mediaType, mediaData, filename, department) {
  try {
    const dept = department.toLowerCase();
    const collection = this.db.db.collection(`non_teaching_faculty_${dept}`);

    const updateData = {
      [`${mediaType}.data`]: mediaData,
      [`${mediaType}.filename`]: filename,
      [`${mediaType}.status`]: 'complete',
      [`field_status.${mediaType}`]: 'complete',
      updated_at: new Date()
    };

    const result = await collection.updateOne(
      { faculty_id: facultyId },
      { $set: updateData }
    );

    if (result.modifiedCount > 0) {
      await this._updateNonTeachingCompletion(facultyId, department);
      await this._checkNonTeachingMediaComplete(facultyId, department);
      console.log(`✅ Updated ${mediaType} for non-teaching faculty ${facultyId}`);
      return true;
    } else {
      console.log(`⚠️  Non-teaching faculty ${facultyId} not found`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error updating non-teaching media: ${error.message}`);
    return false;
  }
}

/**
 * Update non-teaching faculty descriptor
 */
async updateNonTeachingDescriptor(facultyId, descriptor, department) {
  try {
    const dept = department.toLowerCase();
    const collection = this.db.db.collection(`non_teaching_faculty_${dept}`);

    const result = await collection.updateOne(
      { faculty_id: facultyId },
      { 
        $set: { 
          descriptor: descriptor,
          'field_status.descriptor': 'complete',
          updated_at: new Date()
        } 
      }
    );

    if (result.modifiedCount > 0) {
      await this._updateNonTeachingCompletion(facultyId, department);
      console.log(`✅ Updated descriptor for non-teaching faculty ${facultyId}`);
      return true;
    } else {
      console.log(`⚠️  Non-teaching faculty ${facultyId} not found`);
      return false;
    }

  } catch (error) {
    console.error(`❌ Error updating non-teaching descriptor: ${error.message}`);
    return false;
  }
}

/**
 * Update completion percentage for non-teaching faculty
 */
async _updateNonTeachingCompletion(facultyId, department) {
  try {
    const dept = department.toLowerCase();
    const collection = this.db.db.collection(`non_teaching_faculty_${dept}`);
    const faculty = await collection.findOne({ faculty_id: facultyId });
    
    if (!faculty) return;

    const totalFields = 9;
    let completed = 0;

    // Check each field
    if (faculty.surname && faculty.first_name) completed++;
    if (faculty.phone || faculty.email) completed++;
    if (faculty.position && faculty.department) completed++;
    if (faculty.address) completed++;
    if (faculty.government_ids?.gsis || faculty.government_ids?.philhealth) completed++;
    if (faculty.civil_status) completed++;
    if (faculty.image?.status === 'complete') completed++;
    if (faculty.audio?.status === 'complete') completed++;
    if (faculty.descriptor) completed++;

    const completion = (completed / totalFields) * 100;

    await collection.updateOne(
      { faculty_id: facultyId },
      { $set: { completion_percentage: completion } }
    );
  } catch (error) {
    console.error(`❌ Error updating non-teaching completion: ${error.message}`);
  }
}

/**
 * Check if non-teaching faculty media is complete and remove from pending
 */
async _checkNonTeachingMediaComplete(facultyId, department) {
  try {
    const dept = department.toLowerCase();
    const collection = this.db.db.collection(`non_teaching_faculty_${dept}`);
    const faculty = await collection.findOne({ faculty_id: facultyId });
    
    if (!faculty) return;

    const imageComplete = faculty.image?.status === 'complete';
    const audioComplete = faculty.audio?.status === 'complete';
    const descriptorComplete = !!faculty.descriptor;

    if (imageComplete && audioComplete && descriptorComplete) {
      await this.db.db.collection('pending_media').deleteOne({ faculty_id: facultyId });
      console.log(`   🎉 Non-teaching faculty ${facultyId} completed all media requirements`);
    }
  } catch (error) {
    console.error(`❌ Error checking non-teaching media completion: ${error.message}`);
  }
}

/**
 * Get non-teaching faculty pending media
 */
async getNonTeachingPendingMedia() {
  try {
    return await this.db.db.collection('pending_media').find({ 
      faculty_type: 'non_teaching' 
    }).toArray();
  } catch (error) {
    console.error(`❌ Error getting non-teaching pending media: ${error.message}`);
    return [];
  }
}

  /**
   * Get all non-teaching faculty from all departments
   */
  async getAllNonTeachingFaculty() {
    try {
      const departments = [
        'registrar', 'accounting', 'guidance', 'library', 
        'health_services', 'maintenance_custodial', 'security', 
        'system_admin', 'admin_support'
      ];
      const allFaculty = [];

      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`non_teaching_faculty_${dept}`);
          const faculty = await collection.find({ data_type: 'non_teaching_faculty' }).toArray();
          allFaculty.push(...faculty);
        } catch {
          // Collection might not exist yet
          continue;
        }
      }

      return allFaculty;
    } catch (error) {
      console.error(`❌ Error getting all non-teaching faculty: ${error.message}`);
      return [];
    }
  }

  /**
   * Get non-teaching faculty by department
   */
  async getNonTeachingFacultyByDepartment(department) {
    try {
      const dept = department.toLowerCase();
      const collection = this.db.db.collection(`non_teaching_faculty_${dept}`);
      return await collection.find({ data_type: 'non_teaching_faculty' }).toArray();
    } catch (error) {
      console.error(`❌ Error getting non-teaching faculty: ${error.message}`);
      return [];
    }
  }

  /**
   * Get non-teaching faculty statistics
   */
  async getNonTeachingFacultyStatistics() {
    try {
      const allFaculty = await this.getAllNonTeachingFaculty();
      
      const stats = {
        total_faculty: allFaculty.length,
        by_department: {},
        by_position: {},
        by_employment_status: {}
      };

      allFaculty.forEach(faculty => {
        // By department
        const dept = faculty.department || 'ADMIN_SUPPORT';
        stats.by_department[dept] = (stats.by_department[dept] || 0) + 1;

        // By position
        const position = faculty.position || 'UNKNOWN';
        stats.by_position[position] = (stats.by_position[position] || 0) + 1;

        // By employment status
        const status = faculty.employment_status || 'UNKNOWN';
        stats.by_employment_status[status] = (stats.by_employment_status[status] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error(`❌ Error getting non-teaching faculty statistics: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear all non-teaching faculty
   */
  async clearAllNonTeachingFaculty() {
    try {
      // Get ALL collections in the database
      const collections = await this.db.db.listCollections().toArray();
      
      let totalCleared = 0;

      // Find all collections that start with 'non_teaching_faculty_'
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        
        // Check if this is a non-teaching faculty collection
        if (collectionName.startsWith('non_teaching_faculty_')) {
          try {
            const collection = this.db.db.collection(collectionName);
            const result = await collection.deleteMany({ data_type: 'non_teaching_faculty' });
            
            if (result.deletedCount > 0) {
              console.log(`   Cleared ${result.deletedCount} non-teaching faculty record(s) from ${collectionName}`);
              totalCleared += result.deletedCount;
            }
          } catch (error) {
            console.error(`   ⚠️  Error clearing ${collectionName}: ${error.message}`);
            continue;
          }
        }
      }

      if (totalCleared > 0) {
        console.log(`✅ Total non-teaching faculty records cleared: ${totalCleared}`);
      } else {
        console.log('ℹ️  No non-teaching faculty records to clear');
      }
    } catch (error) {
      console.error(`❌ Error clearing non-teaching faculty: ${error.message}`);
    }
  }
}

class CurriculumManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Store curriculum in department-specific collection
   */
  async storeCurriculum(curriculumData) {
    try {
      const dept = (curriculumData.metadata.department || 'UNKNOWN').toLowerCase();
      
      // Get the curriculum collection for this department
      const collection = this.db.db.collection(`curriculum_${dept}`);
      
      const curriculumDoc = {
        // Identification
        curriculum_id: `CURRICULUM_${curriculumData.metadata.department}_${curriculumData.metadata.course}_${curriculumData.metadata.effective_year || Date.now()}`,
        program: curriculumData.metadata.program,
        course: curriculumData.metadata.course,
        department: curriculumData.metadata.department,
        
        // Curriculum Info
        effective_year: curriculumData.metadata.effective_year,
        curriculum_year: curriculumData.metadata.curriculum_year,
        revision: curriculumData.metadata.revision,
        total_subjects: curriculumData.metadata.total_subjects,
        
        // Full curriculum structure (organized by year and semester)
        curriculum: curriculumData.curriculum_data.curriculum,
        
        // Full formatted text
        formatted_text: curriculumData.formatted_text,
        
        // Metadata
        source_file: curriculumData.metadata.source_file,
        data_type: 'curriculum',
        created_at: curriculumData.metadata.created_at,
        updated_at: new Date()
      };
      
      // Insert the document
      const result = await collection.insertOne(curriculumDoc);
      
      console.log(`✅ Curriculum stored in: curriculum_${dept}`);
      console.log(`   Curriculum ID: ${curriculumDoc.curriculum_id}`);
      console.log(`   MongoDB _id: ${result.insertedId}`);
      
      return curriculumDoc.curriculum_id;
      
    } catch (error) {
      console.error(`❌ Error storing curriculum: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all curricula from all departments
   */
  async getAllCurricula() {
    try {
      const departments = ['cas', 'ccs', 'chtm', 'cba', 'cte', 'coe', 'con', 'unknown'];
      const allCurricula = [];

      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`curriculum_${dept}`);
          const curricula = await collection.find({ data_type: 'curriculum' }).toArray();
          allCurricula.push(...curricula);
        } catch {
          // Collection might not exist yet
          continue;
        }
      }

      return allCurricula;
    } catch (error) {
      console.error(`❌ Error getting all curricula: ${error.message}`);
      return [];
    }
  }

  /**
   * Get curricula by department
   */
  async getCurriculaByDepartment(department) {
    try {
      const dept = department.toLowerCase();
      const collection = this.db.db.collection(`curriculum_${dept}`);
      return await collection.find({ data_type: 'curriculum' }).toArray();
    } catch (error) {
      console.error(`❌ Error getting curricula: ${error.message}`);
      return [];
    }
  }

  /**
   * Get curricula by course
   */
  async getCurriculaByCourse(course) {
    try {
      const allCurricula = await this.getAllCurricula();
      return allCurricula.filter(curr => curr.course === course.toUpperCase());
    } catch (error) {
      console.error(`❌ Error getting curricula by course: ${error.message}`);
      return [];
    }
  }

  /**
   * Get curriculum statistics
   */
  async getCurriculumStatistics() {
    try {
      const allCurricula = await this.getAllCurricula();
      
      const stats = {
        total_curricula: allCurricula.length,
        by_department: {},
        by_course: {},
        by_year: {},
        total_subjects_all: 0
      };

      allCurricula.forEach(curriculum => {
        // By department
        const dept = curriculum.department || 'UNKNOWN';
        stats.by_department[dept] = (stats.by_department[dept] || 0) + 1;

        // By course
        const course = curriculum.course || 'UNKNOWN';
        stats.by_course[course] = (stats.by_course[course] || 0) + 1;

        // By effective year
        const year = curriculum.effective_year || 'UNKNOWN';
        stats.by_year[year] = (stats.by_year[year] || 0) + 1;

        // Total subjects
        stats.total_subjects_all += curriculum.total_subjects || 0;
      });

      return stats;
    } catch (error) {
      console.error(`❌ Error getting curriculum statistics: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear all curricula
   */
  async clearAllCurricula() {
  try {
    console.log('🔍 Searching for curriculum collections...');
    
    // Get the actual MongoDB database object
    const database = this.db.db || this.db.client.db();
    
    // Get ALL collections in the database
    const collections = await database.listCollections().toArray();
    
    let totalCleared = 0;
    let collectionsFound = 0;

    // Find and clear all collections that start with 'curriculum_'
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      
      // Check if this is a curriculum collection
      if (collectionName.startsWith('curriculum_')) {
        collectionsFound++;
        console.log(`   🔍 Found collection: ${collectionName}`);
        
        try {
          const collection = database.collection(collectionName);
          
          // Count documents first
          const count = await collection.countDocuments();
          console.log(`      Documents in collection: ${count}`);
          
          if (count > 0) {
            // Delete all documents
            const result = await collection.deleteMany({});
            
            console.log(`   ✅ Cleared ${result.deletedCount} curriculum record(s) from ${collectionName}`);
            totalCleared += result.deletedCount;
          } else {
            console.log(`   ℹ️  ${collectionName} is already empty`);
          }
          
        } catch (error) {
          console.error(`   ⚠️  Error clearing ${collectionName}: ${error.message}`);
          continue;
        }
      }
    }

    if (collectionsFound === 0) {
      console.log('ℹ️  No curriculum collections found in database');
    } else if (totalCleared > 0) {
      console.log(`✅ Total curriculum records cleared: ${totalCleared} from ${collectionsFound} collection(s)`);
    } else {
      console.log(`ℹ️  Found ${collectionsFound} collection(s) but they were already empty`);
    }
    
  } catch (error) {
    console.error(`❌ Error clearing curricula: ${error.message}`);
    console.error(error.stack);
  }
}
}

class NonTeachingScheduleManager {
  constructor(db) {
    this.db = db;
  }

  async storeNonTeachingSchedule(scheduleData) {
    try {
      const dept = (scheduleData.metadata.department || 'UNKNOWN').toLowerCase();
      const collection = this.db.db.collection(`non_teaching_schedule_${dept}`);
      
      const scheduleDoc = {
        schedule_id: `SCHEDULE_NT_${scheduleData.metadata.staff_name.replace(/\s+/g, '_').toUpperCase()}_${Date.now()}`,
        staff_name: scheduleData.metadata.staff_name,
        full_name: scheduleData.metadata.full_name,
        department: scheduleData.metadata.department,
        position: scheduleData.metadata.position || 'Staff',
        total_shifts: scheduleData.metadata.total_shifts,
        days_working: scheduleData.metadata.days_working,
        schedule: scheduleData.schedule_data.schedule,
        schedule_by_day: scheduleData.schedule_data.by_day,
        formatted_text: scheduleData.formatted_text,
        source_file: scheduleData.metadata.source_file,
        data_type: 'non_teaching_faculty_schedule',
        faculty_type: 'non_teaching_schedule',
        created_at: scheduleData.metadata.created_at,
        updated_at: new Date()
      };
      
      const result = await collection.insertOne(scheduleDoc);
      console.log(`✅ Non-teaching schedule stored in: non_teaching_schedule_${dept}`);
      console.log(`   Schedule ID: ${scheduleDoc.schedule_id}`);
      console.log(`   Staff: ${scheduleDoc.staff_name}`);
      console.log(`   MongoDB _id: ${result.insertedId}`);
      
      return scheduleDoc.schedule_id;
    } catch (error) {
      console.error(`❌ Error storing non-teaching schedule: ${error.message}`);
      return null;
    }
  }

  async getAllNonTeachingSchedules() {
    try {
      const departments = ['ccs', 'chtm', 'cba', 'cte', 'coe', 'con', 'cas', 'admin', 'registrar', 'library', 'finance', 'hr', 'unknown'];
      const allSchedules = [];
      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`non_teaching_schedule_${dept}`);
          const schedules = await collection.find({ data_type: 'non_teaching_faculty_schedule' }).toArray();
          allSchedules.push(...schedules);
        } catch { continue; }
      }
      return allSchedules;
    } catch (error) {
      console.error(`❌ Error getting all non-teaching schedules: ${error.message}`);
      return [];
    }
  }

  async getNonTeachingSchedulesByDepartment(department) {
    try {
      const dept = department.toLowerCase();
      const collection = this.db.db.collection(`non_teaching_schedule_${dept}`);
      return await collection.find({ data_type: 'non_teaching_faculty_schedule' }).toArray();
    } catch (error) {
      console.error(`❌ Error getting non-teaching schedules: ${error.message}`);
      return [];
    }
  }

  async getNonTeachingScheduleByStaff(staffName) {
    try {
      const allSchedules = await this.getAllNonTeachingSchedules();
      return allSchedules.filter(schedule => 
        schedule.staff_name.toLowerCase().includes(staffName.toLowerCase())
      );
    } catch (error) {
      console.error(`❌ Error getting schedule by staff: ${error.message}`);
      return [];
    }
  }

  async getNonTeachingScheduleStatistics() {
    try {
      const allSchedules = await this.getAllNonTeachingSchedules();
      const stats = {
        total_schedules: allSchedules.length,
        by_department: {},
        total_shifts_all: 0,
        total_staff: allSchedules.length,
        by_day: {}
      };
      allSchedules.forEach(schedule => {
        const dept = schedule.department || 'UNKNOWN';
        stats.by_department[dept] = (stats.by_department[dept] || 0) + 1;
        stats.total_shifts_all += schedule.total_shifts || 0;
        if (schedule.schedule_by_day) {
          Object.keys(schedule.schedule_by_day).forEach(day => {
            stats.by_day[day] = (stats.by_day[day] || 0) + 1;
          });
        }
      });
      return stats;
    } catch (error) {
      console.error(`❌ Error getting non-teaching schedule statistics: ${error.message}`);
      return null;
    }
  }

  async clearAllNonTeachingSchedules() {
  try {
    console.log('🔍 Searching for non-teaching schedule collections...');
    
    // Get the actual MongoDB database object
    const database = this.db.db || this.db.client.db();
    
    // Get ALL collections in the database
    const collections = await database.listCollections().toArray();
    
    let totalCleared = 0;
    let collectionsFound = 0;

    // Find and clear all collections that start with 'non_teaching_schedule_'
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      
      // Check if this is a non-teaching schedule collection
      if (collectionName.startsWith('non_teaching_schedule_')) {
        collectionsFound++;
        console.log(`   🔍 Found collection: ${collectionName}`);
        
        try {
          const collection = database.collection(collectionName);
          
          // Count documents first
          const count = await collection.countDocuments();
          console.log(`      Documents in collection: ${count}`);
          
          if (count > 0) {
            // Delete all documents
            const result = await collection.deleteMany({});
            
            console.log(`   ✅ Cleared ${result.deletedCount} schedule(s) from ${collectionName}`);
            totalCleared += result.deletedCount;
          } else {
            console.log(`   ℹ️  ${collectionName} is already empty`);
          }
          
        } catch (error) {
          console.error(`   ⚠️  Error clearing ${collectionName}: ${error.message}`);
          continue;
        }
      }
    }

    if (collectionsFound === 0) {
      console.log('ℹ️  No non-teaching schedule collections found in database');
    } else if (totalCleared > 0) {
      console.log(`✅ Total non-teaching schedules cleared: ${totalCleared} from ${collectionsFound} collection(s)`);
    } else {
      console.log(`ℹ️  Found ${collectionsFound} collection(s) but they were already empty`);
    }
    
  } catch (error) {
    console.error(`❌ Error clearing non-teaching schedules: ${error.message}`);
    console.error(error.stack);
  }
}
}

class AdminManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Store admin data in department-specific collection
   */
  async storeAdmin(adminData) {
    try {
      const dept = (adminData.metadata.department || 'ADMIN').toLowerCase();
      
      // Get the admin collection for this department
      const collection = this.db.db.collection(`admin_${dept}`);
      
      const adminDoc = {
        // Identification
        admin_id: `ADMIN_${adminData.metadata.surname.replace(/\s+/g, '_').toUpperCase()}_${Date.now()}`,
        full_name: adminData.metadata.full_name,
        surname: adminData.metadata.surname,
        first_name: adminData.metadata.first_name,
        middle_name: adminData.metadata.middle_name,
        
        // Administrative Info
        department: adminData.metadata.department,
        position: adminData.metadata.position,
        admin_type: adminData.metadata.admin_type,
        employment_status: adminData.metadata.employment_status,
        
        // Contact Info
        email: adminData.metadata.email,
        phone: adminData.metadata.phone,
        
        // Full admin data
        admin_info: adminData.admin_data,
        
        // Formatted text
        formatted_text: adminData.formatted_text,
        
        // Metadata
        source_file: adminData.metadata.source_file,
        data_type: 'admin_excel',
        faculty_type: 'admin',
        created_at: adminData.metadata.created_at,
        updated_at: new Date()
      };
      
      // Insert the document
      const result = await collection.insertOne(adminDoc);
      
      console.log(`✅ Admin stored in: admin_${dept}`);
      console.log(`   Admin ID: ${adminDoc.admin_id}`);
      console.log(`   Name: ${adminDoc.full_name}`);
      console.log(`   Type: ${adminDoc.admin_type}`);
      console.log(`   MongoDB _id: ${result.insertedId}`);
      
      return adminDoc.admin_id;
      
    } catch (error) {
      console.error(`❌ Error storing admin: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all admins from all departments
   */
  async getAllAdmins() {
    try {
      const departments = ['admin', 'school_admin', 'board'];
      const allAdmins = [];

      for (const dept of departments) {
        try {
          const collection = this.db.db.collection(`admin_${dept}`);
          const admins = await collection.find({ data_type: 'admin_excel' }).toArray();
          allAdmins.push(...admins);
        } catch {
          // Collection might not exist yet
          continue;
        }
      }

      return allAdmins;
    } catch (error) {
      console.error(`❌ Error getting all admins: ${error.message}`);
      return [];
    }
  }

  /**
   * Get admins by department
   */
  async getAdminsByDepartment(department) {
    try {
      const dept = department.toLowerCase();
      const collection = this.db.db.collection(`admin_${dept}`);
      return await collection.find({ data_type: 'admin_excel' }).toArray();
    } catch (error) {
      console.error(`❌ Error getting admins: ${error.message}`);
      return [];
    }
  }

  /**
   * Get admins by type (School Administrator or Board Member)
   */
  async getAdminsByType(adminType) {
    try {
      const allAdmins = await this.getAllAdmins();
      return allAdmins.filter(admin => admin.admin_type === adminType);
    } catch (error) {
      console.error(`❌ Error getting admins by type: ${error.message}`);
      return [];
    }
  }

  /**
   * Search admin by name
   */
  async searchAdminByName(name) {
    try {
      const allAdmins = await this.getAllAdmins();
      return allAdmins.filter(admin => 
        admin.full_name.toLowerCase().includes(name.toLowerCase())
      );
    } catch (error) {
      console.error(`❌ Error searching admin: ${error.message}`);
      return [];
    }
  }

  /**
   * Get admin statistics
   */
  async getAdminStatistics() {
    try {
      const allAdmins = await this.getAllAdmins();
      
      const stats = {
        total_admins: allAdmins.length,
        by_department: {},
        by_type: {},
        by_employment_status: {}
      };

      allAdmins.forEach(admin => {
        // By department
        const dept = admin.department || 'UNKNOWN';
        stats.by_department[dept] = (stats.by_department[dept] || 0) + 1;

        // By type
        const type = admin.admin_type || 'Unknown';
        stats.by_type[type] = (stats.by_type[type] || 0) + 1;

        // By employment status
        const status = admin.employment_status || 'Unknown';
        stats.by_employment_status[status] = (stats.by_employment_status[status] || 0) + 1;
      });

      return stats;
    } catch (error) {
      console.error(`❌ Error getting admin statistics: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear all admins
   */
  async clearAllAdmins() {
    try {
      console.log('🔍 Searching for admin collections...');
      
      // Get the actual MongoDB database object
      const database = this.db.db || this.db.client.db();
      
      // Get ALL collections in the database
      const collections = await database.listCollections().toArray();
      
      let totalCleared = 0;
      let collectionsFound = 0;

      // Find and clear all collections that start with 'admin_'
      for (const collectionInfo of collections) {
        const collectionName = collectionInfo.name;
        
        // Check if this is an admin collection
        if (collectionName.startsWith('admin_')) {
          collectionsFound++;
          console.log(`   🔍 Found collection: ${collectionName}`);
          
          try {
            const collection = database.collection(collectionName);
            
            // Count documents first
            const count = await collection.countDocuments();
            console.log(`      Documents in collection: ${count}`);
            
            if (count > 0) {
              // Delete all documents
              const result = await collection.deleteMany({});
              
              console.log(`   ✅ Cleared ${result.deletedCount} admin(s) from ${collectionName}`);
              totalCleared += result.deletedCount;
            } else {
              console.log(`   ℹ️  ${collectionName} is already empty`);
            }
            
          } catch (error) {
            console.error(`   ⚠️  Error clearing ${collectionName}: ${error.message}`);
            continue;
          }
        }
      }

      if (collectionsFound === 0) {
        console.log('ℹ️  No admin collections found in database');
      } else if (totalCleared > 0) {
        console.log(`✅ Total admins cleared: ${totalCleared} from ${collectionsFound} collection(s)`);
      } else {
        console.log(`ℹ️  Found ${collectionsFound} collection(s) but they were already empty`);
      }
      
    } catch (error) {
      console.error(`❌ Error clearing admins: ${error.message}`);
      console.error(error.stack);
    }
  }
}

class GeneralInfoManager {
  constructor(db) {
    this.db = db;
  }

  /**
   * Store general info in MongoDB
   */
  async storeGeneralInfo(generalInfoData) {
    try {
      const infoType = generalInfoData.metadata.info_type;
      
      // Use a single collection for all general info
      const collection = this.db.db.collection('general_info');
      
      const infoDoc = {
        info_id: `INFO_${infoType.toUpperCase()}_${Date.now()}`,
        info_type: infoType,
        
        // Content based on type
        content: generalInfoData.content,
        
        // Raw and formatted text
        raw_text: generalInfoData.raw_text,
        formatted_text: generalInfoData.formatted_text,
        
        // Metadata
        source_file: generalInfoData.metadata.source_file,
        data_type: 'general_info_pdf',
        character_count: generalInfoData.metadata.character_count,
        extracted_at: generalInfoData.metadata.extracted_at,
        created_at: new Date(),
        updated_at: new Date()
      };
      
      // Check if this info type already exists and update or insert
      const existing = await collection.findOne({ info_type: infoType });
      
      if (existing) {
        // Update existing
        await collection.updateOne(
          { info_type: infoType },
          { $set: infoDoc }
        );
        console.log(`✅ Updated ${infoType} in general_info collection`);
      } else {
        // Insert new
        const result = await collection.insertOne(infoDoc);
        console.log(`✅ Stored ${infoType} in general_info collection`);
        console.log(`   MongoDB _id: ${result.insertedId}`);
      }
      
      console.log(`   Info ID: ${infoDoc.info_id}`);
      console.log(`   Type: ${infoType}`);
      console.log(`   Characters: ${infoDoc.character_count}`);
      
      return infoDoc.info_id;
      
    } catch (error) {
      console.error(`❌ Error storing general info: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all general information
   */
  async getAllGeneralInfo() {
    try {
      const collection = this.db.db.collection('general_info');
      return await collection.find({}).toArray();
    } catch (error) {
      console.error(`❌ Error getting general info: ${error.message}`);
      return [];
    }
  }

  /**
   * Get general info by type
   */
  async getGeneralInfoByType(infoType) {
    try {
      const collection = this.db.db.collection('general_info');
      return await collection.findOne({ info_type: infoType });
    } catch (error) {
      console.error(`❌ Error getting general info: ${error.message}`);
      return null;
    }
  }

  /**
   * Get mission and vision
   */
  async getMissionVision() {
    return await this.getGeneralInfoByType('mission_vision');
  }

  /**
   * Get objectives
   */
  async getObjectives() {
    return await this.getGeneralInfoByType('objectives');
  }

  /**
   * Get history
   */
  async getHistory() {
    return await this.getGeneralInfoByType('history');
  }

  /**
   * Get core values
   */
  async getCoreValues() {
    return await this.getGeneralInfoByType('core_values');
  }

  /**
   * Get hymn
   */
  async getHymn() {
    return await this.getGeneralInfoByType('hymn');
  }

  /**
   * Search general info
   */
  async searchGeneralInfo(searchText) {
    try {
      const collection = this.db.db.collection('general_info');
      return await collection.find({
        $or: [
          { raw_text: { $regex: searchText, $options: 'i' } },
          { info_type: { $regex: searchText, $options: 'i' } }
        ]
      }).toArray();
    } catch (error) {
      console.error(`❌ Error searching general info: ${error.message}`);
      return [];
    }
  }

  /**
   * Get general info statistics
   */
  async getGeneralInfoStatistics() {
    try {
      const allInfo = await this.getAllGeneralInfo();
      
      const stats = {
        total_documents: allInfo.length,
        by_type: {},
        total_characters: 0
      };

      allInfo.forEach(info => {
        const type = info.info_type || 'unknown';
        stats.by_type[type] = (stats.by_type[type] || 0) + 1;
        stats.total_characters += info.character_count || 0;
      });

      return stats;
    } catch (error) {
      console.error(`❌ Error getting general info statistics: ${error.message}`);
      return null;
    }
  }

  /**
   * Clear all general info
   */
  async clearAllGeneralInfo() {
    try {
      console.log('🔍 Clearing general info collection...');
      
      const database = this.db.db || this.db.client.db();
      const collection = database.collection('general_info');
      
      const count = await collection.countDocuments();
      console.log(`   Documents in collection: ${count}`);
      
      if (count > 0) {
        const result = await collection.deleteMany({});
        console.log(`✅ Cleared ${result.deletedCount} general info document(s)`);
      } else {
        console.log(`ℹ️  General info collection is already empty`);
      }
      
    } catch (error) {
      console.error(`❌ Error clearing general info: ${error.message}`);
    }
  }

  /**
   * Update specific general info
   */
  async updateGeneralInfo(infoType, updates) {
    try {
      const collection = this.db.db.collection('general_info');
      const result = await collection.updateOne(
        { info_type: infoType },
        { 
          $set: {
            ...updates,
            updated_at: new Date()
          }
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`✅ Updated ${infoType}`);
        return true;
      } else {
        console.log(`⚠️  No document found for ${infoType}`);
        return false;
      }
      
    } catch (error) {
      console.error(`❌ Error updating general info: ${error.message}`);
      return false;
    }
  }

  /**
   * Delete specific general info
   */
  async deleteGeneralInfo(infoType) {
    try {
      const collection = this.db.db.collection('general_info');
      const result = await collection.deleteOne({ info_type: infoType });
      
      if (result.deletedCount > 0) {
        console.log(`✅ Deleted ${infoType}`);
        return true;
      } else {
        console.log(`⚠️  No document found for ${infoType}`);
        return false;
      }
      
    } catch (error) {
      console.error(`❌ Error deleting general info: ${error.message}`);
      return false;
    }
  }
}

module.exports = { 
  StudentDatabase, 
  StudentDataExtractor, 
  CORScheduleManager,
  StudentGradesManager,  
  TeachingFacultyManager,
  TeachingFacultyScheduleManager,
  NonTeachingFacultyManager, 
  CurriculumManager, 
  NonTeachingScheduleManager,
  AdminManager,
  GeneralInfoManager, 
  FieldStatus, 
  MediaDefaults 
};