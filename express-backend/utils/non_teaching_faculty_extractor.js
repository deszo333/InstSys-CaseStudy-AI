// non_teaching_faculty_extractor.js
const xlsx = require('xlsx');
const path = require('path');

class NonTeachingFacultyExtractor {
  constructor() {
    // Non-teaching department mappings
    this.departmentMappings = {
      'REGISTRAR': 'REGISTRAR',
      'REGISTRATION': 'REGISTRAR',
      'RECORDS': 'REGISTRAR',
      'ACCOUNTING': 'ACCOUNTING',
      'FINANCE': 'ACCOUNTING',
      'CASHIER': 'ACCOUNTING',
      'GUIDANCE': 'GUIDANCE',
      'COUNSELING': 'GUIDANCE',
      'COUNSELLING': 'GUIDANCE',
      'LIBRARY': 'LIBRARY',
      'LIBRARIAN': 'LIBRARY',
      'HEALTH SERVICES': 'HEALTH_SERVICES',
      'HEALTH': 'HEALTH_SERVICES',
      'MEDICAL': 'HEALTH_SERVICES',
      'CLINIC': 'HEALTH_SERVICES',
      'MAINTENANCE': 'MAINTENANCE_CUSTODIAL',
      'CUSTODIAL': 'MAINTENANCE_CUSTODIAL',
      'FACILITIES': 'MAINTENANCE_CUSTODIAL',
      'SECURITY': 'SECURITY',
      'SYSTEM ADMIN': 'SYSTEM_ADMIN',
      'IT SUPPORT': 'SYSTEM_ADMIN',
      'ADMIN SUPPORT': 'ADMIN_SUPPORT',
      'ADMINISTRATIVE': 'ADMIN_SUPPORT'
    };
  }

  /**
   * MAIN EXTRACTION METHOD
   * Reuses the same extraction logic as teaching faculty
   */
  async extractNonTeachingFacultyExcelInfo(filename) {
    try {
      // Read Excel file (no headers, raw 2D array)
      const workbook = xlsx.readFile(filename);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      console.log(`📋 Non-Teaching Faculty Excel dimensions: ${data.length} rows x ${data[0]?.length || 0} cols`);

      // Debug - Show raw Excel content
      console.log('📋 Raw Excel content (first 20 rows):');
      for (let i = 0; i < Math.min(20, data.length); i++) {
        const rowData = [];
        for (let j = 0; j < Math.min(data[i].length, 3); j++) {
          if (data[i][j]) {
            rowData.push(`'${data[i][j]}'`);
          } else {
            rowData.push("'N/A'");
          }
        }
        console.log(`   Row ${i}: [${rowData.join(', ')}]`);
      }

      // Convert entire sheet to text
      let allText = '';
      for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < data[i].length; j++) {
          if (data[i][j]) {
            allText += String(data[i][j]) + ' ';
          }
        }
        allText += '\n';
      }

      // Extract faculty data using universal scanner
      const facultyInfo = this.extractUniversalFacultyData(allText, filename);

      if (facultyInfo && (facultyInfo.surname || facultyInfo.first_name || 
                          facultyInfo.position || facultyInfo.department)) {
        console.log('✅ Universal non-teaching faculty extraction successful');
        return facultyInfo;
      }

      console.log('❌ Could not extract sufficient non-teaching faculty data');
      return null;

    } catch (error) {
      console.error(`❌ Error in non-teaching faculty extraction: ${error.message}`);
      return null;
    }
  }

  /**
   * EXTRACT: Universal faculty data scanner
   * Same as teaching faculty extractor
   */
  extractUniversalFacultyData(textContent, filename) {
    const lines = textContent.split('\n').filter(line => line.trim());

    // Initialize faculty data structure
    const facultyData = {
      surname: null,
      first_name: null,
      date_of_birth: null,
      place_of_birth: null,
      citizenship: null,
      sex: null,
      height: null,
      weight: null,
      blood_type: null,
      religion: null,
      civil_status: null,
      address: null,
      zip_code: null,
      phone: null,
      email: null,
      position: null,
      department: null,
      employment_status: null,
      father_name: null,
      father_dob: null,
      father_occupation: null,
      mother_name: null,
      mother_dob: null,
      mother_occupation: null,
      spouse_name: null,
      spouse_dob: null,
      spouse_occupation: null,
      gsis: null,
      philhealth: null
    };

    console.log('🔍 DEBUG: Processing lines for non-teaching faculty data');

    // Process line by line
    for (const line of lines) {
      if (!line || line.trim().length === 0) continue;

      const lineClean = line.trim();

      // Skip section headers
      const sectionHeaders = [
        'PERSONAL INFORMATION', 'CONTACT INFORMATION', 
        'OCCUPATIONAL INFORMATION', 'PROFESSIONAL INFORMATION',
        'FAMILY BACKGROUND', 'GOVERNMENT IDS', 'GOVERNMENT INFORMATION'
      ];
      if (sectionHeaders.includes(lineClean.toUpperCase())) {
        continue;
      }

      // Process key-value pairs
      let parts = null;

      // Method 1: Split by colon
      if (lineClean.includes(':')) {
        parts = lineClean.split(':', 2);
      }
      // Method 2: Detect keyword patterns
      else {
        const words = lineClean.split(/\s+/);
        if (words.length >= 2) {
          const firstWord = words[0].toLowerCase();
          const secondWord = words[1]?.toLowerCase();

          // Check for multi-word keys
          if (firstWord === 'full' && secondWord === 'name') {
            parts = ['Full Name', words.slice(2).join(' ')];
          }
          else if (firstWord === 'date' && secondWord === 'of') {
            parts = ['Date of Birth', words.slice(3).join(' ')];
          }
          else if (firstWord === 'place' && secondWord === 'of') {
            parts = ['Place of Birth', words.slice(3).join(' ')];
          }
          else if (firstWord === 'civil' && secondWord === 'status') {
            parts = ['Civil Status', words.slice(2).join(' ')];
          }
          else if (firstWord === 'blood' && secondWord === 'type') {
            parts = ['Blood Type', words.slice(2).join(' ')];
          }
          else if (firstWord === 'zip' && secondWord === 'code') {
            parts = ['Zip Code', words.slice(2).join(' ')];
          }
          else if (firstWord === 'employment' && secondWord === 'status') {
            parts = ['Employment Status', words.slice(2).join(' ')];
          }
          // Department detection (enhanced)
          else if (['department', 'college', 'school', 'division', 'office', 'unit'].includes(firstWord)) {
            parts = ['Department', words.slice(1).join(' ')];
          }
          // Single-word keys
          else if (['position', 'email', 'phone', 'address', 'citizenship', 
                    'sex', 'height', 'weight', 'religion', 'gsis', 'philhealth'].includes(firstWord)) {
            parts = [words[0], words.slice(1).join(' ')];
          }
        }
      }

      // Process the key-value pair
      if (parts && parts.length === 2) {
        let key = parts[0].trim();
        let value = parts[1].trim();

        // Skip empty or N/A values
        if (!value || ['n/a', 'na', ''].includes(value.toLowerCase())) {
          continue;
        }

        console.log(`🔍 Processing: ${key} = ${value}`);

        // Map to faculty data fields (same as teaching faculty)
        const keyLower = key.toLowerCase();

        if (keyLower.includes('full name')) {
          if (value.includes(',')) {
            const nameParts = value.split(',', 2);
            facultyData.surname = nameParts[0].trim();
            facultyData.first_name = nameParts[1].trim();
          } else {
            const nameParts = value.split(/\s+/);
            if (nameParts.length >= 2) {
              facultyData.first_name = nameParts[0];
              facultyData.surname = nameParts.slice(1).join(' ');
            }
          }
        }
        else if (keyLower.includes('date of birth') || keyLower === 'birthday') {
          facultyData.date_of_birth = value;
        }
        else if (keyLower.includes('place of birth')) {
          facultyData.place_of_birth = value;
        }
        else if (keyLower.includes('citizenship')) {
          facultyData.citizenship = value;
        }
        else if (keyLower === 'sex' || keyLower === 'gender') {
          facultyData.sex = value;
        }
        else if (keyLower.includes('height')) {
          facultyData.height = value;
        }
        else if (keyLower.includes('weight')) {
          facultyData.weight = value;
        }
        else if (keyLower.includes('blood type')) {
          facultyData.blood_type = value;
        }
        else if (keyLower.includes('religion')) {
          facultyData.religion = value;
        }
        else if (keyLower.includes('civil status') || keyLower.includes('marital status')) {
          facultyData.civil_status = value;
        }
        else if (keyLower.includes('address')) {
          facultyData.address = value;
        }
        else if (keyLower.includes('zip code')) {
          facultyData.zip_code = value;
        }
        else if (keyLower.includes('phone') || keyLower.includes('mobile')) {
          facultyData.phone = value;
        }
        else if (keyLower.includes('email')) {
          facultyData.email = value;
        }
        else if (keyLower.includes('position')) {
          facultyData.position = value;
        }
        else if (['department', 'college', 'school', 'division', 'office', 'unit'].some(word => keyLower.includes(word))) {
          facultyData.department = value;
          console.log(`🎯 Found department: ${value}`);
        }
        else if (keyLower.includes('employment status')) {
          facultyData.employment_status = value;
        }
        else if (keyLower.includes('father') && keyLower.includes('name')) {
          facultyData.father_name = value;
        }
        else if (keyLower.includes('mother') && keyLower.includes('name')) {
          facultyData.mother_name = value;
        }
        else if (keyLower.includes('spouse') && keyLower.includes('name')) {
          facultyData.spouse_name = value;
        }
        else if (keyLower.includes('gsis')) {
          facultyData.gsis = value;
        }
        else if (keyLower.includes('philhealth') || keyLower.includes('phil health')) {
          facultyData.philhealth = value;
        }
      }
    }

    // Clean all extracted data
    for (const key in facultyData) {
      if (facultyData[key]) {
        facultyData[key] = this.cleanFacultyValue(facultyData[key], key);
      }
    }

    // FALLBACK: Infer department if missing
    if (!facultyData.department && facultyData.position) {
      facultyData.department = this.inferNonTeachingDepartmentFromPosition(facultyData.position);
      console.log(`🔍 Inferred department from position: ${facultyData.department}`);
    }

    console.log('📊 Final non-teaching faculty data:', facultyData);
    return facultyData;
  }

  /**
   * ENRICH: Infer non-teaching department from position
   * ENHANCED for maintenance and custodial staff
   */
  inferNonTeachingDepartmentFromPosition(position) {
    if (!position) return null;

    const positionUpper = position.toUpperCase();

    // MAINTENANCE FIRST (highest priority)
    if (['MAINTENANCE', 'CUSTODIAL', 'JANITOR', 'CLEANER', 'FACILITIES',
         'MAINTENANCE TECH', 'LEAD MAINTENANCE', 'BUILDING MAINTENANCE',
         'MAINTENANCE ASSISTANT', 'FACILITIES MANAGER'].some(word => positionUpper.includes(word))) {
      return 'MAINTENANCE_CUSTODIAL';
    }
    // Guidance
    else if (['GUIDANCE', 'COUNSELOR', 'COUNSELLING', 'STUDENT AFFAIRS', 'PSYCHOLOGY'].some(word => positionUpper.includes(word))) {
      return 'GUIDANCE';
    }
    // Registrar
    else if (['REGISTRAR', 'REGISTRATION', 'RECORDS'].some(word => positionUpper.includes(word))) {
      return 'REGISTRAR';
    }
    // Accounting
    else if (['ACCOUNTING', 'ACCOUNTANT', 'FINANCE', 'CASHIER', 'TREASURER'].some(word => positionUpper.includes(word))) {
      return 'ACCOUNTING';
    }
    // Library
    else if (['LIBRARY', 'LIBRARIAN'].some(word => positionUpper.includes(word))) {
      return 'LIBRARY';
    }
    // Health Services
    else if (['HEALTH', 'NURSE', 'MEDICAL', 'CLINIC'].some(word => positionUpper.includes(word))) {
      return 'HEALTH_SERVICES';
    }
    // Security
    else if (['SECURITY', 'GUARD'].some(word => positionUpper.includes(word))) {
      return 'SECURITY';
    }
    // System Admin
    else if (['SYSTEM ADMIN', 'IT SUPPORT', 'NETWORK', 'COMPUTER TECHNICIAN', 'IT STAFF'].some(word => positionUpper.includes(word))) {
      return 'SYSTEM_ADMIN';
    }
    // Admin Support (default for office staff)
    else if (['OFFICE ADMINISTRATION', 'ADMINISTRATIVE', 'SECRETARY', 'ASSISTANT', 
              'CLERK', 'OFFICE', 'ADMIN'].some(word => positionUpper.includes(word))) {
      return 'ADMIN_SUPPORT';
    }

    return null;
  }

  /**
   * ENRICH: Infer non-teaching department from email
   */
  inferNonTeachingDepartmentFromEmail(email) {
    if (!email) return null;

    const emailLower = email.toLowerCase();

    if (['registrar', 'records', 'enrollment'].some(prefix => emailLower.includes(prefix))) {
      return 'REGISTRAR';
    }
    else if (['accounting', 'finance', 'cashier'].some(prefix => emailLower.includes(prefix))) {
      return 'ACCOUNTING';
    }
    else if (['guidance', 'counselor'].some(prefix => emailLower.includes(prefix))) {
      return 'GUIDANCE';
    }
    else if (['library', 'lib'].some(prefix => emailLower.includes(prefix))) {
      return 'LIBRARY';
    }
    else if (['health', 'clinic', 'nurse'].some(prefix => emailLower.includes(prefix))) {
      return 'HEALTH_SERVICES';
    }
    else if (['maintenance', 'facilities'].some(prefix => emailLower.includes(prefix))) {
      return 'MAINTENANCE_CUSTODIAL';
    }
    else if (['security', 'guard'].some(prefix => emailLower.includes(prefix))) {
      return 'SECURITY';
    }
    else if (['admin', 'it', 'support'].some(prefix => emailLower.includes(prefix))) {
      return 'SYSTEM_ADMIN';
    }

    return null;
  }

  /**
   * ENRICH: Default department assignment
   */
  defaultNonTeachingDepartmentAssignment(position) {
    if (!position) return 'ADMIN_SUPPORT';

    const positionUpper = position.toUpperCase();

    // Very broad categorizations as fallback
    if (['STAFF', 'OFFICER', 'COORDINATOR'].some(word => positionUpper.includes(word))) {
      return 'ADMIN_SUPPORT';
    }
    else if (['TECHNICIAN', 'SPECIALIST'].some(word => positionUpper.includes(word))) {
      return 'SYSTEM_ADMIN';
    }

    return 'ADMIN_SUPPORT'; // Ultimate fallback
  }

  /**
   * TRANSFORM: Clean faculty values (same as teaching faculty)
   */
  cleanFacultyValue(value, fieldType) {
    if (!value || value.trim().length === 0) return null;

    value = value.trim();

    // Filter out header values
    const headerValues = [
      'SURNAME', 'FIRST NAME', 'DATE OF BIRTH', 'PLACE OF BIRTH', 
      'CITIZENSHIP', 'SEX', 'HEIGHT', 'WEIGHT', 'BLOOD TYPE', 
      'RELIGION', 'CIVIL STATUS', 'ADDRESS', 'ZIP CODE', 'PHONE', 
      'EMAIL', 'POSITION', 'DEPARTMENT', 'EMPLOYMENT STATUS'
    ];
    if (headerValues.includes(value.toUpperCase())) {
      return null;
    }

    // NAME FIELDS
    if (['surname', 'first_name', 'father_name', 'mother_name', 'spouse_name'].includes(fieldType)) {
      let cleaned = value.replace(/[^A-Za-z\s.,-]/g, '');
      cleaned = cleaned.replace(/\b(DATE|BIRTH|OF|PLACE)\b/gi, '');
      cleaned = cleaned.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      return cleaned.length > 1 ? cleaned : null;
    }

    // DATE FIELDS
    if (['date_of_birth', 'father_dob', 'mother_dob', 'spouse_dob'].includes(fieldType)) {
      const dateMatch = value.match(/(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/);
      return dateMatch ? dateMatch[1] : null;
    }

    // SEX/GENDER
    if (fieldType === 'sex') {
      const sexUpper = value.toUpperCase();
      if (sexUpper.includes('MALE') && !sexUpper.includes('FEMALE')) {
        return 'Male';
      } else if (sexUpper.includes('FEMALE')) {
        return 'Female';
      }
      return null;
    }

    // PHONE
    if (fieldType === 'phone') {
      const phoneMatch = value.match(/(\d{11}|\+63\d{10}|09\d{9})/);
      return phoneMatch ? phoneMatch[1] : null;
    }

    // EMAIL
    if (fieldType === 'email') {
      const emailMatch = value.match(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,})/);
      return emailMatch ? emailMatch[1].toLowerCase() : null;
    }

    // DEPARTMENT
    if (fieldType === 'department') {
      let cleaned = value.replace(/[^A-Za-z\s&]/g, '');
      cleaned = cleaned.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      return cleaned.length >= 2 ? this.standardizeNonTeachingDepartmentName(cleaned) : null;
    }

    // POSITION
    if (fieldType === 'position') {
      let cleaned = value.replace(/[^A-Za-z\s.]/g, '');
      cleaned = cleaned.split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
      return cleaned.length > 2 ? cleaned : null;
    }

    // GOVERNMENT IDs
    if (['gsis', 'philhealth'].includes(fieldType)) {
      let cleaned = value.toUpperCase();
      
      const noiseWords = ['NUMBER', 'NO', 'ID', 'GSIS', 'PHILHEALTH', 'PHIL', 'HEALTH'];
      noiseWords.forEach(word => {
        cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, 'g'), '').trim();
      });
      
      cleaned = cleaned.replace(/[^A-Z0-9-]/g, '');
      
      if (fieldType === 'gsis' && cleaned.length === 11 && /^\d+$/.test(cleaned)) {
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 9)}-${cleaned.slice(9)}`;
      }
      
      if (fieldType === 'philhealth' && cleaned.length === 12 && /^\d+$/.test(cleaned)) {
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 11)}-${cleaned.slice(11)}`;
      }
      
      return cleaned.length >= 3 ? cleaned : null;
    }

    // DEFAULT
    return value.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * TRANSFORM: Standardize non-teaching department names
   */
  standardizeNonTeachingDepartmentName(department) {
    if (!department) return 'ADMIN_SUPPORT';

    const deptUpper = department.toUpperCase().trim();

    // Check exact mappings
    if (this.departmentMappings[deptUpper]) {
      return this.departmentMappings[deptUpper];
    }

    // Check partial matches
    for (const [key, value] of Object.entries(this.departmentMappings)) {
      if (deptUpper.includes(key)) {
        return value;
      }
    }

    // Default fallback
    return 'ADMIN_SUPPORT';
  }

  /**
   * FORMAT: Create formatted text for display/storage
   */
  formatNonTeachingFacultyInfo(facultyInfo) {
    const formatField = (value) => {
      return (value && value !== 'None' && value !== 'N/A' && value !== '') ? value : 'N/A';
    };

    let text = `NON-TEACHING FACULTY INFORMATION

PERSONAL INFORMATION:
Surname: ${formatField(facultyInfo.surname)}
First Name: ${formatField(facultyInfo.first_name)}
Date of Birth: ${formatField(facultyInfo.date_of_birth)}
Place of Birth: ${formatField(facultyInfo.place_of_birth)}
Citizenship: ${formatField(facultyInfo.citizenship)}
Sex: ${formatField(facultyInfo.sex)}
Height: ${formatField(facultyInfo.height)}
Weight: ${formatField(facultyInfo.weight)}
Blood Type: ${formatField(facultyInfo.blood_type)}
Religion: ${formatField(facultyInfo.religion)}
Civil Status: ${formatField(facultyInfo.civil_status)}

CONTACT INFORMATION:
Address: ${formatField(facultyInfo.address)}
Zip Code: ${formatField(facultyInfo.zip_code)}
Phone: ${formatField(facultyInfo.phone)}
Email: ${formatField(facultyInfo.email)}

PROFESSIONAL INFORMATION:
Position: ${formatField(facultyInfo.position)}
Department: ${formatField(facultyInfo.department)}
Employment Status: ${formatField(facultyInfo.employment_status)}`;

    // Only show family info if at least one field has data
    const familyFields = [
      'father_name', 'father_dob', 'father_occupation',
      'mother_name', 'mother_dob', 'mother_occupation',
      'spouse_name', 'spouse_dob', 'spouse_occupation'
    ];

    const hasFamilyData = familyFields.some(field => {
      const value = facultyInfo[field];
      return value && value !== 'None' && value !== 'N/A' && value !== '';
    });

    if (hasFamilyData) {
      text += `

FAMILY INFORMATION:
Father's Name: ${formatField(facultyInfo.father_name)}
Father's Date of Birth: ${formatField(facultyInfo.father_dob)}
Father's Occupation: ${formatField(facultyInfo.father_occupation)}

Mother's Name: ${formatField(facultyInfo.mother_name)}
Mother's Date of Birth: ${formatField(facultyInfo.mother_dob)}
Mother's Occupation: ${formatField(facultyInfo.mother_occupation)}

Spouse's Name: ${formatField(facultyInfo.spouse_name)}
Spouse's Date of Birth: ${formatField(facultyInfo.spouse_dob)}
Spouse's Occupation: ${formatField(facultyInfo.spouse_occupation)}`;
    }

    // Only show government IDs if available
    const gsis = facultyInfo.gsis;
    const philhealth = facultyInfo.philhealth;

    if ((gsis && gsis !== 'None' && gsis !== 'N/A') || 
        (philhealth && philhealth !== 'None' && philhealth !== 'N/A')) {
      text += `

GOVERNMENT IDs:
GSIS: ${formatField(gsis)}
PhilHealth: ${formatField(philhealth)}`;
    }

    return text.trim();
  }

  /**
   * HELPER: Title case
   */
  titleCase(str) {
    return str.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * PROCESS: Main processing method
   */
  async processNonTeachingFacultyExcel(filename) {
    try {
      // EXTRACT
      const facultyInfo = await this.extractNonTeachingFacultyExcelInfo(filename);

      if (!facultyInfo) {
        console.log('❌ Could not extract non-teaching faculty data from Excel');
        return null;
      }

      // SMART DEPARTMENT INFERENCE (5 methods)
      let department = facultyInfo.department;

      // Method 1: Direct extraction (already done)
      // Method 2: Infer from position
      if (!department || ['N/A', 'NA', ''].includes(department)) {
        if (facultyInfo.position) {
          department = this.inferNonTeachingDepartmentFromPosition(facultyInfo.position);
          if (department) {
            console.log(`🔍 Inferred department from position: ${department}`);
          }
        }
      }

      // Method 3: Infer from email
      if (!department || ['N/A', 'NA', ''].includes(department)) {
        if (facultyInfo.email) {
          department = this.inferNonTeachingDepartmentFromEmail(facultyInfo.email);
          if (department) {
            console.log(`🔍 Inferred department from email: ${department}`);
          }
        }
      }

      // Method 4: Default based on position type
      if (!department || ['N/A', 'NA', ''].includes(department)) {
        if (facultyInfo.position) {
          department = this.defaultNonTeachingDepartmentAssignment(facultyInfo.position);
          console.log(`🔍 Default department assignment: ${department}`);
        }
      }

      // Final fallback
      if (!department || ['N/A', 'NA', ''].includes(department)) {
        department = 'ADMIN_SUPPORT';
      }

      // Update faculty info with determined department
      facultyInfo.department = this.standardizeNonTeachingDepartmentName(department);

      // FORMAT
      const formattedText = this.formatNonTeachingFacultyInfo(facultyInfo);

      // BUILD METADATA
      let fullName = '';
      if (facultyInfo.surname && facultyInfo.first_name) {
        fullName = `${facultyInfo.surname}, ${facultyInfo.first_name}`;
      } else if (facultyInfo.surname) {
        fullName = facultyInfo.surname;
      } else if (facultyInfo.first_name) {
        fullName = facultyInfo.first_name;
      } else {
        fullName = 'Unknown Faculty';
      }

      const metadata = {
        full_name: fullName,
        surname: facultyInfo.surname || '',
        first_name: facultyInfo.first_name || '',
        department: facultyInfo.department,
        position: facultyInfo.position || '',
        employment_status: facultyInfo.employment_status || '',
        email: facultyInfo.email || '',
        phone: facultyInfo.phone || '',
        data_type: 'non_teaching_faculty',
        faculty_type: 'non_teaching',
        source_file: path.basename(filename),
        created_at: new Date()
      };

      console.log('✅ Non-teaching faculty processing complete');
      console.log(`   👨‍💼 Faculty: ${metadata.full_name} (${metadata.position})`);
      console.log(`   🏛️ Department: ${metadata.department}`);

      return {
        faculty_info: facultyInfo,
        formatted_text: formattedText,
        metadata: metadata
      };

    } catch (error) {
      console.error(`❌ Error processing non-teaching faculty Excel: ${error.message}`);
      return null;
    }
  }
}

module.exports = NonTeachingFacultyExtractor;