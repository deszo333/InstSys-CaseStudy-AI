// admin_extractor.js
const xlsx = require('xlsx');
const fs = require('fs');

class AdminExtractor {
  constructor() {
    this.requiredFields = ['surname', 'first_name', 'position'];
  }

  /**
   * Main function to process Admin Excel file
   */
  async processAdminExcel(filePath) {
    try {
      console.log(`\n📋 Processing admin file: ${filePath}`);
      
      // Read the Excel file
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to array of arrays for easier processing
      const data = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null });
      
      console.log(`📋 Excel dimensions: ${data.length} rows x ${data[0]?.length || 0} columns`);
      
      // Extract admin information
      const adminInfo = this.extractAdminInfo(data);
      
      if (!adminInfo) {
        console.log('❌ Could not extract admin data from Excel');
        return null;
      }
      
      // Infer admin position type
      const adminType = this.inferAdminPositionType(adminInfo.position);
      adminInfo.admin_type = adminType;

      
      
      
      // Standardize department based on admin type (not the Department field)
      // This ensures consistency: all Board Members go to admin_board, all School Admins go to admin_school_admin
      let cleanDepartment;
      if (adminType === 'Board Member') {
        cleanDepartment = 'BOARD';
      } else if (adminType === 'School Administrator') {
        cleanDepartment = 'SCHOOL_ADMIN';
      } else {
        // Fallback to standardizing the Department field value
        cleanDepartment = this.standardizeAdminDepartment(adminInfo.department || 'ADMIN');
      }
      adminInfo.department = cleanDepartment;
      
      // Build full name
      const fullName = this.buildFullName(adminInfo);
      
      // Format the output
      const result = {
        metadata: {
          full_name: fullName,
          surname: adminInfo.surname || '',
          first_name: adminInfo.first_name || '',
          middle_name: adminInfo.middle_name || '',
          department: cleanDepartment,
          position: adminInfo.position || '',
          admin_type: adminType,
          employment_status: adminInfo.employment_status || '',
          email: adminInfo.email || '',
          phone: adminInfo.phone || '',
          data_type: 'admin_excel',
          faculty_type: 'admin',
          source_file: filePath.split(/[/\\]/).pop(),
          created_at: new Date()
        },
        admin_data: adminInfo,
        formatted_text: this.formatAdminText(adminInfo)
      };
      
      console.log(`✅ Extracted admin: ${fullName} (${adminType})`);
      return result;
      
    } catch (error) {
      console.error(`❌ Error processing admin Excel: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract admin information from Excel data
   */
  extractAdminInfo(data) {
    const adminInfo = {};
    
    // Search for field labels and their values
    for (let i = 0; i < Math.min(100, data.length); i++) {
      const row = data[i];
      if (!row) continue;
      
      for (let j = 0; j < Math.min(10, row.length); j++) {
        if (!row[j]) continue;
        
        const cellValue = String(row[j]).trim();
        const cellUpper = cellValue.toUpperCase();
        
        // Personal Information - Check Full Name first (before other name fields)
        if (this.matchesLabel(cellUpper, ['FULL NAME', 'FULL NAME:']) && !cellUpper.includes('EMPLOYER') && !cellUpper.includes('BUSINESS')) {
          const fullName = this.extractValue(row, j, data, i);
          if (fullName) {
            // Parse "Surname, First Name" format
            if (fullName.includes(',')) {
              const parts = fullName.split(',').map(p => p.trim());
              adminInfo.surname = parts[0];
              adminInfo.first_name = parts[1] || '';
            } else {
              // If no comma, treat as full name
              const parts = fullName.trim().split(' ');
              if (parts.length >= 2) {
                adminInfo.surname = parts[parts.length - 1]; // Last word as surname
                adminInfo.first_name = parts.slice(0, -1).join(' '); // Rest as first name
              } else {
                adminInfo.first_name = fullName;
              }
            }
          }
        }
        else if (this.matchesLabel(cellUpper, ['SURNAME:', 'SURNAME', 'LAST NAME:', 'FAMILY NAME:'])) {
          adminInfo.surname = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['FIRST NAME:', 'FIRST NAME', 'GIVEN NAME:', 'FIRSTNAME:'])) {
          adminInfo.first_name = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['MIDDLE NAME:', 'MIDDLE NAME', 'MIDDLENAME:'])) {
          adminInfo.middle_name = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['DATE OF BIRTH:', 'DATE OF BIRTH', 'BIRTHDATE:', 'BIRTHDATE', 'DOB:', 'DOB'])) {
          adminInfo.date_of_birth = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['PLACE OF BIRTH:', 'PLACE OF BIRTH', 'BIRTHPLACE:', 'BIRTHPLACE'])) {
          adminInfo.place_of_birth = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['SEX:', 'SEX', 'GENDER:', 'GENDER'])) {
          adminInfo.sex = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['CITIZENSHIP:', 'CITIZENSHIP', 'NATIONALITY:', 'NATIONALITY'])) {
          adminInfo.citizenship = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['HEIGHT:', 'HEIGHT'])) {
          adminInfo.height = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['WEIGHT:', 'WEIGHT'])) {
          adminInfo.weight = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['BLOOD TYPE:', 'BLOOD TYPE'])) {
          adminInfo.blood_type = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['RELIGION:', 'RELIGION'])) {
          adminInfo.religion = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['CIVIL STATUS:', 'CIVIL STATUS', 'MARITAL STATUS:', 'MARITAL STATUS'])) {
          adminInfo.civil_status = this.extractValue(row, j, data, i);
        }
        
        // Contact Information
        else if (this.matchesLabel(cellUpper, ['ADDRESS:', 'ADDRESS', 'RESIDENTIAL ADDRESS:', 'RESIDENTIAL ADDRESS'])) {
          adminInfo.address = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['ZIP CODE:', 'ZIP CODE', 'ZIPCODE:', 'ZIPCODE', 'POSTAL CODE:', 'POSTAL CODE'])) {
          adminInfo.zip_code = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['TELEPHONE:', 'TELEPHONE', 'PHONE:', 'PHONE', 'CONTACT NUMBER:', 'MOBILE:', 'MOBILE'])) {
          adminInfo.phone = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['EMAIL:', 'EMAIL', 'EMAIL ADDRESS:', 'E-MAIL:', 'E-MAIL'])) {
          adminInfo.email = this.extractValue(row, j, data, i);
        }
        
        // Administrative/Occupational Information
        else if (this.matchesLabel(cellUpper, ['POSITION:', 'POSITION', 'JOB TITLE:', 'DESIGNATION:'])) {
          adminInfo.position = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['DEPARTMENT:', 'DEPARTMENT', 'OFFICE:', 'DEPT:'])) {
          adminInfo.department = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['EMPLOYMENT STATUS:', 'EMPLOYMENT STATUS', 'STATUS:'])) {
          adminInfo.employment_status = this.extractValue(row, j, data, i);
        }
        
        // Family Information
        else if (this.matchesLabel(cellUpper, ["FATHER'S NAME:", "FATHER'S NAME", 'FATHER NAME:'])) {
          adminInfo.father_name = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ["FATHER'S DATE OF BIRTH:", "FATHER'S DOB:", 'DATE OF BIRTH']) && !adminInfo.father_dob) {
          // Check if previous line was about father
          if (i > 0 && data[i-1] && String(data[i-1][0]).toUpperCase().includes('FATHER')) {
            adminInfo.father_dob = this.extractValue(row, j, data, i);
          }
        }
        else if (this.matchesLabel(cellUpper, ["FATHER'S OCCUPATION:", 'OCCUPATION']) && !adminInfo.father_occupation) {
          // Check if previous lines were about father
          if (i > 0 && data[i-1] && String(data[i-1][0]).toUpperCase().includes('DATE OF BIRTH')) {
            if (i > 1 && data[i-2] && String(data[i-2][0]).toUpperCase().includes('FATHER')) {
              adminInfo.father_occupation = this.extractValue(row, j, data, i);
            }
          }
        }
        else if (this.matchesLabel(cellUpper, ["MOTHER'S NAME:", "MOTHER'S NAME", 'MOTHER NAME:'])) {
          adminInfo.mother_name = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ["MOTHER'S DATE OF BIRTH:", "MOTHER'S DOB:", 'DATE OF BIRTH']) && !adminInfo.mother_dob) {
          // Check if previous line was about mother
          if (i > 0 && data[i-1] && String(data[i-1][0]).toUpperCase().includes('MOTHER')) {
            adminInfo.mother_dob = this.extractValue(row, j, data, i);
          }
        }
        else if (this.matchesLabel(cellUpper, ["MOTHER'S OCCUPATION:", 'OCCUPATION']) && !adminInfo.mother_occupation) {
          // Check if previous lines were about mother
          if (i > 0 && data[i-1] && String(data[i-1][0]).toUpperCase().includes('DATE OF BIRTH')) {
            if (i > 1 && data[i-2] && String(data[i-2][0]).toUpperCase().includes('MOTHER')) {
              adminInfo.mother_occupation = this.extractValue(row, j, data, i);
            }
          }
        }
        else if (this.matchesLabel(cellUpper, ["SPOUSE'S NAME:", "SPOUSE'S NAME", 'SPOUSE NAME:'])) {
          adminInfo.spouse_name = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ["SPOUSE'S DATE OF BIRTH:", "SPOUSE'S DOB:", 'DATE OF BIRTH']) && !adminInfo.spouse_dob) {
          // Check if previous line was about spouse
          if (i > 0 && data[i-1] && String(data[i-1][0]).toUpperCase().includes('SPOUSE')) {
            adminInfo.spouse_dob = this.extractValue(row, j, data, i);
          }
        }
        else if (this.matchesLabel(cellUpper, ["SPOUSE'S OCCUPATION:", 'OCCUPATION']) && !adminInfo.spouse_occupation) {
          // Check if previous lines were about spouse
          if (i > 0 && data[i-1] && String(data[i-1][0]).toUpperCase().includes('DATE OF BIRTH')) {
            if (i > 1 && data[i-2] && String(data[i-2][0]).toUpperCase().includes('SPOUSE')) {
              adminInfo.spouse_occupation = this.extractValue(row, j, data, i);
            }
          }
        }
        
        // Government IDs
        else if (this.matchesLabel(cellUpper, ['GSIS:', 'GSIS NO:', 'GSIS NO', 'GSIS NUMBER:', 'GSIS NUMBER', 'GSIS'])) {
          adminInfo.gsis = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['PHILHEALTH:', 'PHILHEALTH NO:', 'PHILHEALTH NO', 'PHILHEALTH NUMBER:', 'PHILHEALTH NUMBER', 'PHILHEALTH'])) {
          adminInfo.philhealth = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['SSS:', 'SSS NO:', 'SSS NO', 'SSS NUMBER:', 'SSS NUMBER', 'SSS'])) {
          adminInfo.sss = this.extractValue(row, j, data, i);
        }
        else if (this.matchesLabel(cellUpper, ['TIN:', 'TIN NO:', 'TIN NO', 'TIN NUMBER:', 'TIN NUMBER', 'TIN'])) {
          adminInfo.tin = this.extractValue(row, j, data, i);
        }
      }
    }
    
    // Validate required fields
    if (!adminInfo.surname && !adminInfo.first_name) {
      console.log('⚠️  Missing required fields: surname or first_name');
      return null;
    }
    
    return adminInfo;
  }

  /**
   * Check if cell matches any label
   */
  matchesLabel(cellUpper, labels) {
    return labels.some(label => cellUpper.includes(label));
  }

  /**
   * Extract value from cell (right cell or below cell)
   */
  extractValue(row, colIndex, data, rowIndex) {
    // Try right cell first
    if (colIndex + 1 < row.length && row[colIndex + 1]) {
      const value = String(row[colIndex + 1]).trim();
      if (value && !['N/A', 'NA', ''].includes(value.toUpperCase())) {
        return value;
      }
    }
    
    // Try cell below
    if (rowIndex + 1 < data.length && data[rowIndex + 1][colIndex]) {
      const value = String(data[rowIndex + 1][colIndex]).trim();
      if (value && !['N/A', 'NA', ''].includes(value.toUpperCase())) {
        return value;
      }
    }
    
    return '';
  }

  /**
   * Infer admin position type
   */
  inferAdminPositionType(position) {
    if (!position) return 'School Administrator';
    
    const positionUpper = position.toUpperCase();
    
    if (positionUpper.includes('BOARD MEMBER') || 
        positionUpper.includes('BOARD DIRECTOR') || 
        positionUpper.includes('BOARD OF DIRECTORS')) {
      return 'Board Member';
    } else if (positionUpper.includes('SCHOOL ADMIN') || 
               positionUpper.includes('SCHOOL ADMINISTRATOR') || 
               positionUpper.includes('ADMINISTRATOR') || 
               positionUpper.includes('ADMIN')) {
      return 'School Administrator';
    }
    
    return 'School Administrator';
  }

  /**
   * Standardize admin department name
   */
  standardizeAdminDepartment(department) {
    if (!department) return 'ADMIN';
    
    const deptUpper = department.toUpperCase().trim();
    
    const deptMappings = {
      'SCHOOL ADMIN': 'SCHOOL_ADMIN',
      'SCHOOL ADMINISTRATOR': 'SCHOOL_ADMIN',
      'SCHOOL ADMINISTRATION': 'SCHOOL_ADMIN',
      'BOARD MEMBER': 'BOARD',
      'BOARD OF DIRECTORS': 'BOARD',
      'BOARD DIRECTOR': 'BOARD',
      'ADMINISTRATOR': 'ADMIN',
      'ADMINISTRATION': 'ADMIN'
    };
    
    // Check exact mappings
    for (const [fullName, cleanName] of Object.entries(deptMappings)) {
      if (deptUpper.includes(fullName)) {
        return cleanName;
      }
    }
    
    // Clean up for collection naming
    let cleaned = deptUpper.replace(/[^A-Z0-9]/g, '_');
    cleaned = cleaned.replace(/_+/g, '_').replace(/^_|_$/g, '');
    
    return cleaned || 'ADMIN';
  }

  /**
   * Build full name
   */
  buildFullName(adminInfo) {
    if (adminInfo.surname && adminInfo.first_name) {
      return `${adminInfo.surname}, ${adminInfo.first_name}`;
    } else if (adminInfo.surname) {
      return adminInfo.surname;
    } else if (adminInfo.first_name) {
      return adminInfo.first_name;
    }
    return 'Unknown Administrator';
  }

  /**
   * Format admin information as text
   */
  formatAdminText(adminInfo) {
    const formatField = (value) => {
      if (value && !['None', 'N/A', ''].includes(String(value))) {
        return value;
      }
      return 'N/A';
    };
    
    let text = '='.repeat(60) + '\n';
    text += 'ADMINISTRATIVE STAFF INFORMATION\n';
    text += '='.repeat(60) + '\n\n';
    
    text += 'PERSONAL INFORMATION:\n';
    text += `  Surname: ${formatField(adminInfo.surname)}\n`;
    text += `  First Name: ${formatField(adminInfo.first_name)}\n`;
    if (adminInfo.middle_name) {
      text += `  Middle Name: ${formatField(adminInfo.middle_name)}\n`;
    }
    text += `  Date of Birth: ${formatField(adminInfo.date_of_birth)}\n`;
    text += `  Place of Birth: ${formatField(adminInfo.place_of_birth)}\n`;
    text += `  Citizenship: ${formatField(adminInfo.citizenship)}\n`;
    text += `  Sex: ${formatField(adminInfo.sex)}\n`;
    text += `  Height: ${formatField(adminInfo.height)}\n`;
    text += `  Weight: ${formatField(adminInfo.weight)}\n`;
    text += `  Blood Type: ${formatField(adminInfo.blood_type)}\n`;
    text += `  Religion: ${formatField(adminInfo.religion)}\n`;
    text += `  Civil Status: ${formatField(adminInfo.civil_status)}\n`;
    text += '\n';
    
    text += 'CONTACT INFORMATION:\n';
    text += `  Address: ${formatField(adminInfo.address)}\n`;
    text += `  Zip Code: ${formatField(adminInfo.zip_code)}\n`;
    text += `  Phone: ${formatField(adminInfo.phone)}\n`;
    text += `  Email: ${formatField(adminInfo.email)}\n`;
    text += '\n';
    
    text += 'ADMINISTRATIVE INFORMATION:\n';
    text += `  Position: ${formatField(adminInfo.position)}\n`;
    text += `  Admin Type: ${formatField(adminInfo.admin_type)}\n`;
    text += `  Department: Administration\n`;
    text += `  Employment Status: ${formatField(adminInfo.employment_status)}\n`;
    
    // Add family info if exists
    const familyFields = ['father_name', 'father_dob', 'father_occupation',
                         'mother_name', 'mother_dob', 'mother_occupation',
                         'spouse_name', 'spouse_dob', 'spouse_occupation'];
    
    const hasFamilyData = familyFields.some(field => 
      adminInfo[field] && !['None', 'N/A', ''].includes(String(adminInfo[field]))
    );
    
    if (hasFamilyData) {
      text += '\n';
      text += 'FAMILY INFORMATION:\n';
      text += `  Father's Name: ${formatField(adminInfo.father_name)}\n`;
      text += `  Father's Date of Birth: ${formatField(adminInfo.father_dob)}\n`;
      text += `  Father's Occupation: ${formatField(adminInfo.father_occupation)}\n`;
      text += '\n';
      text += `  Mother's Name: ${formatField(adminInfo.mother_name)}\n`;
      text += `  Mother's Date of Birth: ${formatField(adminInfo.mother_dob)}\n`;
      text += `  Mother's Occupation: ${formatField(adminInfo.mother_occupation)}\n`;
      text += '\n';
      text += `  Spouse's Name: ${formatField(adminInfo.spouse_name)}\n`;
      text += `  Spouse's Date of Birth: ${formatField(adminInfo.spouse_dob)}\n`;
      text += `  Spouse's Occupation: ${formatField(adminInfo.spouse_occupation)}\n`;
    }
    
    // Add government IDs if exist
    if (adminInfo.gsis || adminInfo.philhealth || adminInfo.sss || adminInfo.tin) {
      text += '\n';
      text += 'GOVERNMENT IDs:\n';
      if (adminInfo.gsis) text += `  GSIS: ${formatField(adminInfo.gsis)}\n`;
      if (adminInfo.philhealth) text += `  PhilHealth: ${formatField(adminInfo.philhealth)}\n`;
      if (adminInfo.sss) text += `  SSS: ${formatField(adminInfo.sss)}\n`;
      if (adminInfo.tin) text += `  TIN: ${formatField(adminInfo.tin)}\n`;
    }
    
    return text;
  }
}

module.exports = AdminExtractor;