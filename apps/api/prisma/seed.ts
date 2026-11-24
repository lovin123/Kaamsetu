import { PrismaClient, Role, TaskStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run destructive seed in production');
  }
  await prisma.idempotencyRecord.deleteMany();
  await prisma.actionLog.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.taskProgress.deleteMany();
  await prisma.blocker.deleteMany();
  await prisma.materialRequest.deleteMany();
  await prisma.incident.deleteMany();
  await prisma.task.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 10);

  const supervisor = await prisma.user.create({
    data: {
      phone: '9000000009',
      passwordHash,
      name: 'Ramesh Site Manager',
      role: Role.SUPERVISOR,
      preferredLanguage: 'hi-IN',
    },
  });

  const worker1 = await prisma.user.create({
    data: {
      phone: '9000000001',
      passwordHash,
      name: 'Suresh Electrician',
      role: Role.WORKER,
      preferredLanguage: 'hi-IN',
    },
  });

  const worker2 = await prisma.user.create({
    data: {
      phone: '9000000002',
      passwordHash,
      name: 'Ganesh Plumber',
      role: Role.WORKER,
      preferredLanguage: 'mr-IN',
    },
  });

  const project = await prisma.project.create({
    data: {
      name: 'Pune Tech Park Tower B',
      code: 'PTP-B',
      location: 'Hinjewadi Phase 2, Pune',
      description: 'Electrical and finishing works — floors 1-5',
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: supervisor.id, role: Role.SUPERVISOR },
      { projectId: project.id, userId: worker1.id, role: Role.WORKER },
      { projectId: project.id, userId: worker2.id, role: Role.WORKER },
    ],
  });

  const wiring = await prisma.task.create({
    data: {
      projectId: project.id,
      createdById: supervisor.id,
      assigneeId: worker1.id,
      title: 'Second floor electrical wiring',
      description: 'Complete conduit and wiring for second floor offices',
      location: 'Second floor',
      status: TaskStatus.in_progress,
      progressPercent: 40,
    },
  });

  const panel = await prisma.task.create({
    data: {
      projectId: project.id,
      createdById: supervisor.id,
      assigneeId: worker1.id,
      title: 'Electrical panel installation',
      description: 'Install and test main electrical panel on second floor',
      location: 'Second floor electrical room',
      status: TaskStatus.pending,
      progressPercent: 0,
    },
  });

  await prisma.task.create({
    data: {
      projectId: project.id,
      createdById: supervisor.id,
      assigneeId: worker2.id,
      title: 'Third floor plumbing rough-in',
      description: 'Install water supply lines for washrooms',
      location: 'Third floor',
      status: TaskStatus.in_progress,
      progressPercent: 25,
    },
  });

  await prisma.taskProgress.create({
    data: {
      taskId: wiring.id,
      userId: worker1.id,
      progressPercent: 40,
      notes: 'Conduit mostly done',
      source: 'seed',
      transcript: 'Second floor wiring 40 percent complete',
    },
  });

  await prisma.incident.create({
    data: {
      projectId: project.id,
      taskId: panel.id,
      reporterId: worker1.id,
      category: 'electrical',
      title: 'Panel door hinge damaged',
      description: 'Electrical panel door hinge is bent, needs replacement',
      location: 'Second floor electrical room',
      severity: 'medium',
      transcript: 'Panel ka hinge kharab hai',
    },
  });

  await prisma.materialRequest.create({
    data: {
      projectId: project.id,
      taskId: wiring.id,
      requesterId: worker1.id,
      materialName: 'Copper cable',
      quantity: 20,
      unit: 'metre',
      urgency: 'urgent',
      notes: 'For remaining second floor runs',
      transcript: '20 metre cable ki zarurat hai',
    },
  });

  console.log('Seed complete');
  console.log('Supervisor: 9000000009 / password123');
  console.log('Workers: 9000000001, 9000000002 / password123');
  console.log(`Project: ${project.name} (${project.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
