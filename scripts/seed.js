/* eslint-disable no-console */
const { getDb, clearAllData, close } = require('../src/config/database');
const userService = require('../src/services/userService');
const userRepository = require('../src/repositories/userRepository');
const equipmentRepository = require('../src/repositories/equipmentRepository');
const loanRepository = require('../src/repositories/loanRepository');
const auditService = require('../src/services/auditService');
const dates = require('../src/utils/dates');

const USERS = [
  { key: 'admin', name: 'Alice Admin', email: 'admin@lablend.edu', password: 'Admin@12345', role: 'ADMIN' },
  { key: 'tech', name: 'Tiago Technician', email: 'tech@lablend.edu', password: 'Tech@12345', role: 'TECHNICIAN' },
  { key: 'ana', name: 'Ana Souza', email: 'ana@student.lablend.edu', password: 'Student@123', role: 'STUDENT' },
  { key: 'bruno', name: 'Bruno Lima', email: 'bruno@student.lablend.edu', password: 'Student@123', role: 'STUDENT' },
  { key: 'carla', name: 'Carla Mendes', email: 'carla@student.lablend.edu', password: 'Student@123', role: 'STUDENT' },
];

const EQUIPMENT = [
  ['osc1', 'Rigol DS1054Z Oscilloscope', 'Oscilloscope', 'OSC-1054-001', '4-channel **50 MHz** digital oscilloscope.\n\n- 1 GSa/s sample rate\n- 12 Mpts memory\n- Includes 4 passive probes'],
  ['osc2', 'Siglent SDS1202X-E Oscilloscope', 'Oscilloscope', 'OSC-1202-002', '2-channel **200 MHz** oscilloscope with serial decoding (I2C, SPI, UART).'],
  ['osc3', 'Tektronix TBS1052C Oscilloscope', 'Oscilloscope', 'OSC-1052-003', '2-channel 50 MHz oscilloscope. _Currently being recalibrated._'],
  ['mm1', 'Fluke 117 Multimeter', 'Multimeter', 'MM-117-001', 'True-RMS digital multimeter with non-contact voltage detection.'],
  ['mm2', 'UNI-T UT61E Multimeter', 'Multimeter', 'MM-61E-002', '22000-count multimeter with PC interface.'],
  ['mm3', 'Minipa ET-2042E Multimeter', 'Multimeter', 'MM-2042-003', 'General-purpose handheld multimeter.'],
  ['ard1', 'Arduino Uno R3 Starter Kit', 'Microcontroller Kit', 'MCU-ARD-001', 'Arduino Uno R3 with breadboard, jumpers, LEDs, sensors and servo.\n\n| Item | Qty |\n|---|---|\n| Uno R3 | 1 |\n| Breadboard | 1 |\n| Jumpers | 65 |'],
  ['esp1', 'ESP32 DevKit Kit', 'Microcontroller Kit', 'MCU-ESP-002', 'ESP32-WROOM-32 dev board with Wi-Fi/BLE, sensors and USB cable.'],
  ['rpi1', 'Raspberry Pi 4 Kit (4 GB)', 'Microcontroller Kit', 'MCU-RPI-003', 'Raspberry Pi 4 Model B with case, PSU and 32 GB microSD.'],
  ['stm1', 'STM32 Nucleo-F401RE', 'Microcontroller Kit', 'MCU-STM-004', 'ARM Cortex-M4 development board with on-board ST-LINK debugger.'],
  ['pr1', 'Prusa i3 MK3S+ 3D Printer', '3D Printer', 'PRN-MK3-001', 'FDM printer, 250×210×210 mm build volume. PLA and PETG only.'],
  ['pr2', 'Creality Ender-3 V2 3D Printer', '3D Printer', 'PRN-END-002', 'FDM printer, 220×220×250 mm. _Nozzle replacement pending._'],
  ['ps1', 'Minipa MPL-3305M Power Supply', 'Power Supply', 'PSU-3305-001', 'Dual-channel 0–32 V / 0–5 A bench power supply.'],
  ['sg1', 'Siglent SDG1032X Signal Generator', 'Signal Generator', 'SIG-1032-001', '2-channel 30 MHz arbitrary waveform generator.'],
  ['ana1', 'Saleae Logic 8 Analyzer', 'Logic Analyzer', 'LOG-SAL-001', '8-channel USB logic analyzer, 100 MS/s digital.'],
];

const MAINTENANCE = new Set(['osc3', 'pr2']);

async function main() {
  getDb();
  clearAllData();
  const today = dates.today();
  const d = (n) => dates.addDays(today, n);

  const users = {};
  for (const u of USERS) {
    const passwordHash = await userService.hashPassword(u.password);
    users[u.key] = userRepository.create({
      name: u.name,
      email: u.email,
      passwordHash,
      role: u.role,
      preferences: JSON.stringify({ language: 'pt-BR', notifications: { email: true } }),
    });
  }

  const eq = {};
  for (const [key, name, category, serialNumber, description] of EQUIPMENT) {
    eq[key] = equipmentRepository.create({
      name,
      category,
      serialNumber,
      description,
      status: MAINTENANCE.has(key) ? 'MAINTENANCE' : 'AVAILABLE',
    });
  }

  const loan = (userKey, eqKey, start, due, status, extra = {}) => {
    const created = loanRepository.create({
      userId: users[userKey].id,
      equipmentId: eq[eqKey].id,
      requestedStart: start,
      dueDate: due,
      notes: extra.requestNotes || null,
    });
    if (status !== 'PENDING') loanRepository.updateStatus(created.id, status, extra.update || {});
    if (['ACTIVE', 'OVERDUE'].includes(status)) equipmentRepository.updateStatus(eq[eqKey].id, 'LOANED');
    auditService.log(users[userKey].id, 'LOAN_REQUESTED', 'Loan', created.id, { seed: true });
    if (status !== 'PENDING') auditService.log(users.tech.id, `LOAN_${status}`, 'Loan', created.id, { seed: true });
    return created;
  };

  // Ana: one active, one pending
  loan('ana', 'osc1', d(-3), d(4), 'ACTIVE');
  loan('ana', 'esp1', d(2), d(9), 'PENDING', { requestNotes: 'Capstone project prototype' });
  // Bruno: one overdue (4 days late -> R$ 20.00), one returned
  loan('bruno', 'ard1', d(-12), d(-4), 'OVERDUE', { update: { lateFeeCents: 2000 } });
  loan('bruno', 'mm1', d(-30), d(-23), 'RETURNED', { update: { returnedAt: new Date(`${d(-23)}T15:00:00`).toISOString() } });
  // Carla: approved (future), rejected, cancelled, returned late with fee
  loan('carla', 'pr1', d(3), d(10), 'APPROVED');
  loan('carla', 'rpi1', d(1), d(5), 'REJECTED', { update: { notes: 'Kit reserved for a workshop that week' } });
  loan('carla', 'sg1', d(5), d(8), 'CANCELLED');
  loan('carla', 'mm2', d(-20), d(-15), 'RETURNED', {
    update: { returnedAt: new Date(`${d(-13)}T10:00:00`).toISOString(), lateFeeCents: 1000 },
  });
  // Technician borrowing a supply
  loan('tech', 'ps1', d(-1), d(6), 'ACTIVE');
  // Pending request for an item that is currently loaned (future dates)
  loan('ana', 'ps1', d(8), d(12), 'PENDING');

  console.log(`Seeded ${USERS.length} users, ${EQUIPMENT.length} equipment items, 10 loans.`);
  console.log('Credentials:');
  for (const u of USERS) console.log(`  ${u.role.padEnd(10)} ${u.email.padEnd(28)} ${u.password}`);
  close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
