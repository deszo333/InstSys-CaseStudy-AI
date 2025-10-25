// teaching_faculty_extractor.js
const xlsx = require('xlsx');
const path = require('path');

class TeachingFacultyExtractor {
  constructor() {
    // Known department mappings
    this.departmentMappings = {
      'COLLEGE OF ARTS & SCIENCES': 'CAS',
      'COLLEGE OF ARTS AND SCIENCES': 'CAS',
      'ARTS AND SCIENCES': 'CAS',
      'MATHEMATICS DEPARTMENT': 'CAS',
      'COLLEGE OF COMPUTER STUDIES': 'CCS',
      'COMPUTER STUDIES': 'CCS',
      'INFORMATION TECHNOLOGY': 'CCS',
      'COLLEGE OF EDUCATION': 'CTE',
      'EDUCATION': 'CTE',
      'COLLEGE OF HOSPITALITY': 'CHTM',
      'HOSPITALITY': 'CHTM',
      'TOURISM': 'CHTM',
      'COLLEGE OF BUSINESS': 'CBA',
      'BUSINESS': 'CBA',
      'OFFICE ADMINISTRATION': 'CBA',
      'COLLEGE OF ENGINEERING': 'COE',
      'ENGINEERING': 'COE',
      'COLLEGE OF NURSING': 'CON',
      'NURSING': 'CON'
    };
  }

  /**
   * MAIN EXTRACTION METHOD
   * Universal teaching faculty extraction that works with ANY Excel format
   */
  async extractTeachingFacultyExcelInfo(filename) {
    try {
      // STEP 1: Read Excel file (no headers, raw 2D array)
      const workbook = xlsx.readFile(filename);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      console.log(`📋 Teaching Faculty Excel dimensions: ${data.length} rows x ${data[0]?.length || 0} cols`);

      // STEP 2: Debug - Show raw Excel content
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

      // STEP 3: Convert entire sheet to text
      let allText = '';
      for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < data[i].length; j++) {
          if (data[i][j]) {
            allText += String(data[i][j]) + ' ';
          }
        }
        allText += '\n';
      }

      // STEP 4: Extract faculty data using universal scanner
      const facultyInfo = this.extractUniversalTeachingFacultyData(allText, filename);

      if (facultyInfo && (facultyInfo.surname || facultyInfo.first_name || 
                          facultyInfo.position || facultyInfo.department)) {
        console.log('✅ Universal teaching faculty extraction successful');
        return facultyInfo;
      }

      console.log('❌ Could not extract sufficient teaching faculty data');
      return null;

    } catch (error) {
      console.error(`❌ Error in teaching faculty extraction: ${error.message}`);
      return null;
    }
  }

  /**
   * UNIVERSAL DATA EXTRACTOR
   * Processes structured key-value pairs from Excel text
   */
  extractUniversalTeachingFacultyData(textContent, filename) {
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

    console.log('🔍 DEBUG: Processing lines for faculty data');

    // PROCESS LINE BY LINE
    for (const line of lines) {
      if (!line || line.trim().length === 0) continue;

      const lineClean = line.trim();

      // SKIP SECTION HEADERS
      const sectionHeaders = [
        'PERSONAL INFORMATION', 'CONTACT INFORMATION', 
        'OCCUPATIONAL INFORMATION', 'PROFESSIONAL INFORMATION',
        'FAMILY BACKGROUND', 'GOVERNMENT IDS', 'GOVERNMENT INFORMATION'
      ];
      if (sectionHeaders.includes(lineClean.toUpperCase())) {
        continue;
      }

      // PROCESS KEY-VALUE PAIRS
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
          else if (['department', 'college', 'school', 'division', 'office'].includes(firstWord)) {
            parts = ['Department', words.slice(1).join(' ')];
          }
          // Single-word keys
          else if (['position', 'email', 'phone', 'address', 'citizenship', 
                    'sex', 'height', 'weight', 'religion', 'gsis', 'philhealth'].includes(firstWord)) {
            parts = [words[0], words.slice(1).join(' ')];
          }
        }
      }

      // PROCESS THE KEY-VALUE PAIR
      if (parts && parts.length === 2) {
        let key = parts[0].trim();
        let value = parts[1].trim();

        // Skip empty or N/A values
        if (!value || ['n/a', 'na', ''].includes(value.toLowerCase())) {
          continue;
        }

        console.log(`🔍 Processing: ${key} = ${value}`);

        // MAP TO FACULTY DATA FIELDS
        const keyLower = key.toLowerCase();

        if (keyLower.includes('full name')) {
          // Parse "Surname, First Name" or "First Name Last Name"
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
        // ENHANCED: Department detection
        else if (['department', 'college', 'school', 'division', 'office'].some(word => keyLower.includes(word))) {
          facultyData.department = value;
          console.log(`🎯 Found department: ${value}`);
        }
        else if (keyLower.includes('employment status')) {
          facultyData.employment_status = value;
        }
        // Family information
        else if (keyLower.includes('father') && keyLower.includes('name')) {
          facultyData.father_name = value;
        }
        else if (keyLower.includes('mother') && keyLower.includes('name')) {
          facultyData.mother_name = value;
        }
        else if (keyLower.includes('spouse') && keyLower.includes('name')) {
          facultyData.spouse_name = value;
        }
        // Government IDs
        else if (keyLower.includes('gsis')) {
          facultyData.gsis = value;
        }
        else if (keyLower.includes('philhealth') || keyLower.includes('phil health')) {
          facultyData.philhealth = value;
        }
      }
    }

    // CLEAN ALL EXTRACTED DATA
    for (const key in facultyData) {
      if (facultyData[key]) {
        facultyData[key] = this.cleanTeachingFacultyValue(facultyData[key], key);
      }
    }

    // FALLBACK: Infer department if missing
    if (!facultyData.department && facultyData.position) {
      facultyData.department = this.inferDepartmentFromPosition(facultyData.position);
      console.log(`🔍 Inferred department from position: ${facultyData.department}`);
    }

    console.log('📊 Final faculty data:', facultyData);
    return facultyData;
  }

  /**
   * TRANSFORM: Clean faculty values based on field type
   */
  cleanTeachingFacultyValue(value, fieldType) {
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
      // Remove non-alphabetic characters (keep spaces, dots, commas, hyphens)
      let cleaned = value.replace(/[^A-Za-z\s.,-]/g, '');
      // Remove noise words
      cleaned = cleaned.replace(/\b(DATE|BIRTH|OF|PLACE)\b/gi, '');
      // Title case
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
      return cleaned.length >= 2 ? this.standardizeDepartmentName(cleaned) : null;
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
      
      // Remove noise words
      const noiseWords = ['NUMBER', 'NO', 'ID', 'GSIS', 'PHILHEALTH', 'PHIL', 'HEALTH'];
      noiseWords.forEach(word => {
        cleaned = cleaned.replace(new RegExp(`\\b${word}\\b`, 'g'), '').trim();
      });
      
      // Keep only alphanumeric and dashes
      cleaned = cleaned.replace(/[^A-Z0-9-]/g, '');
      
      // Format GSIS (11 digits)
      if (fieldType === 'gsis' && cleaned.length === 11 && /^\d+$/.test(cleaned)) {
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 9)}-${cleaned.slice(9)}`;
      }
      
      // Format PhilHealth (12 digits)
      if (fieldType === 'philhealth' && cleaned.length === 12 && /^\d+$/.test(cleaned)) {
        return `${cleaned.slice(0, 2)}-${cleaned.slice(2, 11)}-${cleaned.slice(11)}`;
      }
      
      return cleaned.length >= 3 ? cleaned : null;
    }

    // DEFAULT: Basic cleaning
    return value.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * TRANSFORM: Standardize department names
   */
  standardizeDepartmentName(department) {
    if (!department) return 'UNKNOWN';

    const deptUpper = department.toUpperCase().trim();

    // Direct abbreviation match
    const directMatch = ['CAS', 'CCS', 'CTE', 'CHTM', 'CBA', 'COE', 'CON'];
    if (directMatch.includes(deptUpper)) {
      return deptUpper;
    }

    // Map full names to abbreviations
    for (const [fullName, abbrev] of Object.entries(this.departmentMappings)) {
      if (deptUpper.includes(fullName)) {
        return abbrev;
      }
    }

    return deptUpper;
  }

  /**
   * ENRICH: Infer department from position
   */
  inferDepartmentFromPosition(position) {
    if (!position) return null;

    const positionUpper = position.toUpperCase();

    // Dean positions
    if (positionUpper.includes('DEAN')) {
      if (['COMPUTER', 'TECHNOLOGY', 'IT'].some(word => positionUpper.includes(word))) {
        return 'CCS';
      }
      if (['BUSINESS', 'ADMIN'].some(word => positionUpper.includes(word))) {
        return 'CBA';
      }
      if (['HOSPITALITY', 'TOURISM'].some(word => positionUpper.includes(word))) {
        return 'CHTM';
      }
      if (positionUpper.includes('EDUCATION')) {
        return 'CTE';
      }
      if (positionUpper.includes('ENGINEERING')) {
        return 'COE';
      }
      if (positionUpper.includes('NURSING')) {
        return 'CON';
      }
      return 'ADMIN';
    }

    // Subject-based positions
    if (['COMPUTER', 'IT', 'PROGRAMMING', 'SOFTWARE'].some(word => positionUpper.includes(word))) {
      return 'CCS';
    }
    if (['BUSINESS', 'ACCOUNTING', 'FINANCE', 'MARKETING'].some(word => positionUpper.includes(word))) {
      return 'CBA';
    }
    if (['HOSPITALITY', 'TOURISM', 'CULINARY'].some(word => positionUpper.includes(word))) {
      return 'CHTM';
    }
    if (['EDUCATION', 'TEACHING'].some(word => positionUpper.includes(word))) {
      return 'CTE';
    }
    if (['ENGINEERING', 'MECHANICAL', 'ELECTRICAL'].some(word => positionUpper.includes(word))) {
      return 'COE';
    }
    if (['NURSING', 'HEALTH'].some(word => positionUpper.includes(word))) {
      return 'CON';
    }

    return null;
  }

  /**
   * ENRICH: Infer department from email
   */
  inferDepartmentFromEmail(email) {
    if (!email) return null;

    const emailLower = email.toLowerCase();

    if (['cs.', 'ccs.', 'compsci', 'computer'].some(prefix => emailLower.includes(prefix))) {
      return 'CCS';
    }
    if (['business', 'admin', 'acct', 'finance'].some(prefix => emailLower.includes(prefix))) {
      return 'CBA';
    }
    if (['hospitality', 'tourism', 'hotel'].some(prefix => emailLower.includes(prefix))) {
      return 'CHTM';
    }
    if (['education', 'teaching'].some(prefix => emailLower.includes(prefix))) {
      return 'CTE';
    }
    if (emailLower.includes('engineering')) {
      return 'COE';
    }
    if (['nursing', 'health'].some(prefix => emailLower.includes(prefix))) {
      return 'CON';
    }

    return null;
  }

  /**
   * ENRICH: Infer department from filename
   */
  inferDepartmentFromFilename(filename) {
    const filenameLower = filename.toLowerCase();

    if (['ccs', 'computer', 'cs'].some(dept => filenameLower.includes(dept))) {
      return 'CCS';
    }
    if (['cba', 'business', 'admin'].some(dept => filenameLower.includes(dept))) {
      return 'CBA';
    }
    if (['chtm', 'hospitality', 'tourism'].some(dept => filenameLower.includes(dept))) {
      return 'CHTM';
    }
    if (['cte', 'education'].some(dept => filenameLower.includes(dept))) {
      return 'CTE';
    }
    if (['coe', 'engineering'].some(dept => filenameLower.includes(dept))) {
      return 'COE';
    }
    if (['con', 'nursing'].some(dept => filenameLower.includes(dept))) {
      return 'CON';
    }

    return null;
  }

  /**
   * FORMAT: Create formatted text for display/storage
   */
  formatTeachingFacultyInfo(facultyInfo) {
    const formatField = (value) => {
      return (value && value !== 'None' && value !== 'N/A' && value !== '') ? value : 'N/A';
    };

    let text = `TEACHING FACULTY INFORMATION

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
   * PROCESS: Main processing method
   */
  async processTeachingFacultyExcel(filename) {
    try {
      // EXTRACT
      const facultyInfo = await this.extractTeachingFacultyExcelInfo(filename);

      if (!facultyInfo) {
        console.log('❌ Could not extract teaching faculty data from Excel');
        return null;
      }

      // SMART DEPARTMENT INFERENCE (5 methods)
      let department = facultyInfo.department;

      // Method 1: Direct extraction (already done)
      // Method 2: Infer from position
      if (!department || ['N/A', 'NA', ''].includes(department)) {
        if (facultyInfo.position) {
          department = this.inferDepartmentFromPosition(facultyInfo.position);
          if (department) {
            console.log(`🔍 Inferred department from position: ${department}`);
          }
        }
      }

      // Method 3: Infer from email
      if (!department || ['N/A', 'NA', ''].includes(department)) {
        if (facultyInfo.email) {
          department = this.inferDepartmentFromEmail(facultyInfo.email);
          if (department) {
            console.log(`🔍 Inferred department from email: ${department}`);
          }
        }
      }

      // Method 4: Infer from filename
      if (!department || ['N/A', 'NA', ''].includes(department)) {
        department = this.inferDepartmentFromFilename(filename);
        if (department) {
          console.log(`🔍 Inferred department from filename: ${department}`);
        }
      }

      // Method 5: Default based on position type
      if (!department || ['N/A', 'NA', ''].includes(department)) {
        if (facultyInfo.position) {
          const positionUpper = facultyInfo.position.toUpperCase();
          if (positionUpper.includes('DEAN')) {
            department = 'ADMIN';
          } else if (positionUpper.includes('PROFESSOR') || positionUpper.includes('INSTRUCTOR')) {
            department = 'CAS';
          }
          console.log(`🔍 Default department assignment: ${department}`);
        }
      }

      // Final fallback
      if (!department || ['N/A', 'NA', ''].includes(department)) {
        department = 'UNKNOWN';
      }

      // Update faculty info with determined department
      facultyInfo.department = this.standardizeDepartmentName(department);

      // FORMAT
      const formattedText = this.formatTeachingFacultyInfo(facultyInfo);

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
        data_type: 'teaching_faculty',
        faculty_type: 'teaching',
        source_file: path.basename(filename),
        created_at: new Date()
      };

      console.log('✅ Teaching faculty processing complete');
      console.log(`   👨‍🏫 Faculty: ${metadata.full_name} (${metadata.position})`);
      console.log(`   🏛️ Department: ${metadata.department}`);

      return {
        faculty_info: facultyInfo,
        formatted_text: formattedText,
        metadata: metadata
      };

    } catch (error) {
      console.error(`❌ Error processing teaching faculty Excel: ${error.message}`);
      return null;
    }
  }
}

module.exports = TeachingFacultyExtractor;