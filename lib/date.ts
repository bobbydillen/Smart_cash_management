// lib/date.ts
export function getLocalISODate (): string
{
    // Returns YYYY-MM-DD in LOCAL timezone (IST safe)
    return new Date().toLocaleDateString( "en-CA" )
}
