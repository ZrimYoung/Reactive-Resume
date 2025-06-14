const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // 创建本地用户
  const user = await prisma.user.upsert({
    where: { email: 'local@example.com' },
    update: {},
    create: {
      id: 'local-user-id',
      name: '本地用户',
      username: 'local-user',
      email: 'local@example.com',
      locale: 'zh-CN',
    },
  });

  console.log('本地用户已创建:', user);

  // 创建示例简历
  const resume = await prisma.resume.upsert({
    where: { 
      userId_slug: {
        userId: user.id,
        slug: 'my-first-resume'
      }
    },
    update: {},
    create: {
      title: '我的第一份简历',
      slug: 'my-first-resume',
      data: JSON.stringify({
        basics: {
          name: '本地用户',
          email: 'local@example.com',
          phone: '',
          location: {
            address: '',
            city: '',
            region: '',
            postalCode: '',
            country: ''
          },
          summary: '这是一个示例简历，您可以开始编辑它。'
        },
        sections: {}
      }),
      visibility: 'private',
      userId: user.id,
    },
  });

  console.log('示例简历已创建:', resume);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 