import psycopg2

conn = psycopg2.connect('postgresql://postgres:postgres@127.0.0.1:5432/schnell_dashboard')
cur = conn.cursor()

# Set clean ward_name as just the ward number e.g. "W61"
# "near the ward number dont ever drop any ward names just display the ward W61 like this"
cur.execute("UPDATE wards SET ward_name = ward_number;")
conn.commit()

print(f"Updated {cur.rowcount} wards to clean format!")

cur.execute("SELECT id, ward_number, ward_name, ward_code FROM wards WHERE region_id = 1 ORDER BY id;")
for row in cur.fetchall():
    print(row)

conn.close()
