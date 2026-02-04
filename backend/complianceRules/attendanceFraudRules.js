const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const toTimestamp = (value) => {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

const haversineDistanceKm = (a, b) => {
  if (!a || !b) return 0;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const lat1 = toNumber(a.lat ?? a.latitude);
  const lon1 = toNumber(a.lng ?? a.longitude ?? a.lon);
  const lat2 = toNumber(b.lat ?? b.latitude);
  const lon2 = toNumber(b.lng ?? b.longitude ?? b.lon);
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const radLat1 = toRad(lat1);
  const radLat2 = toRad(lat2);
  const aHarv =
    Math.sin(dLat / 2) ** 2 + Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(aHarv), Math.sqrt(1 - aHarv));
};

export const runAttendanceFraudRules = ({ attendanceSummary = {} }) => {
  const violations = [];
  const devices = attendanceSummary.devices ? Array.from(attendanceSummary.devices) : [];
  const daily = attendanceSummary.daily || [];

  if (devices.length >= 3) {
    violations.push({
      type: 'Attendance Device Cloning',
      severity: 'Medium',
      message: 'Multiple device IDs detected for a single employee.',
      recommendedFix: 'Verify biometric device assignments and block shared device usage.',
    });
  }

  const timestampCounts = daily.reduce((acc, record) => {
    const ts = record.checkInTime ?? record.timestamp ?? record.checkIn;
    if (ts) {
      const key = typeof ts === 'string' ? ts : String(ts);
      acc[key] = (acc[key] || 0) + 1;
    }
    return acc;
  }, {});

  const repeatedTimestamp = Object.values(timestampCounts).some((count) => count >= 3);
  if (repeatedTimestamp) {
    violations.push({
      type: 'Attendance Timestamp Reuse',
      severity: 'Medium',
      message: 'Identical timestamps repeated across multiple attendance records.',
      recommendedFix: 'Audit check-in devices for cloned timestamps or manual overrides.',
    });
  }

  const sortedDaily = [...daily].sort((a, b) => (toTimestamp(a.date || a.checkInTime) ?? 0) - (toTimestamp(b.date || b.checkInTime) ?? 0));
  for (let index = 1; index < sortedDaily.length; index += 1) {
    const previous = sortedDaily[index - 1];
    const current = sortedDaily[index];
    const prevTime = toTimestamp(previous.date || previous.checkInTime);
    const currentTime = toTimestamp(current.date || current.checkInTime);
    if (!prevTime || !currentTime) continue;
    const timeDiffHours = Math.abs(currentTime - prevTime) / 36e5;
    const distance = haversineDistanceKm(previous.location, current.location);
    if (distance > 300 && timeDiffHours < 2) {
      violations.push({
        type: 'Impossible Travel',
        severity: 'High',
        message: 'Check-ins show impossible travel between distant locations.',
        recommendedFix: 'Verify location data and confirm attendance authenticity.',
      });
      break;
    }
  }

  const totalDays = toNumber(attendanceSummary.totalDays ?? daily.length);
  const presentDays = toNumber(attendanceSummary.presentDays ?? 0);
  const recent = sortedDaily.slice(-5);
  const recentPerfect = recent.length >= 5 && recent.every((record) => record.status === 'present');
  const overallRate = totalDays ? presentDays / totalDays : 0;
  if (recentPerfect && overallRate < 0.8) {
    violations.push({
      type: 'Sudden Perfect Attendance',
      severity: 'Low',
      message: 'Perfect attendance detected after an inconsistent attendance pattern.',
      recommendedFix: 'Validate attendance records and confirm updated scheduling patterns.',
    });
  }

  return violations;
};

export default runAttendanceFraudRules;
