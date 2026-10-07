"""Reuse the unchanged A2 fixture against the isolated Server84 replay."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[2]
source=(root/'scripts/cp14/outbound-acceptance.ts').read_text().replace('otr-cp14-a2-acceptance','otr-cp15-seeded').replace('"../../','"'+str(root)+'/')
with tempfile.NamedTemporaryFile(suffix='.ts',mode='w') as fixture:
 fixture.write(source);fixture.flush()
 subprocess.run(['node','--import','tsx',fixture.name],cwd=root,check=True)
