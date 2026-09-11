import { prisma } from '../src/lib/db'

async function main() {
  const result = await prisma.fetchLog.updateMany({
    where: {
      OR: [
        { errorMessage: { contains: 'No Records Found' } },
        { errorMessage: { contains: 'NOTC_010' } },
        { errorMessage: { contains: 'no records found' } },
      ],
    },
    data: {
      status: 'success',
      errorMessage: null,
    },
  })

  console.log(`Successfully updated ${result.count} fetch log entries from 'error' to 'success'.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
