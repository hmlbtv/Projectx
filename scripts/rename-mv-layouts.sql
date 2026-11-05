-- Rename MV layouts: ALL CAPS, words joined by -, no trailing (...) suffix, duplicates get -DUP1, -DUP2.
-- Safe to re-run: a layout is only renamed if it still has the old name below. Run on the production database when ready.
begin;
update mv_layouts set name='FULL-SCREEN' where id=1 and name='Full-Screen';
update mv_layouts set name='4-WAY' where id=3 and name='4_WAY';
update mv_layouts set name='6-WAY-DUP1' where id=4 and name='6-way (3x2)';
update mv_layouts set name='9-WAY-DUP1' where id=5 and name='9-way (3x3)';
update mv_layouts set name='16-WAY' where id=6 and name='16-way (4x4)';
update mv_layouts set name='1+5' where id=7 and name='1 + 5';
update mv_layouts set name='TX-LEFT' where id=9 and name='TX Left';
update mv_layouts set name='PROD-STCK-MIMIC' where id=50 and name='PROD STCK MIMIC';
update mv_layouts set name='TEST' where id=57 and name='test';
update mv_layouts set name='4-WAY+UMD' where id=58 and name='4_WAY+UMD';
update mv_layouts set name='4-WAY+UMD+AUDIO' where id=59 and name='4_WAY+UMD+Audio';
update mv_layouts set name='TEST-DELETE-1' where id=60 and name='test delete 1';
update mv_layouts set name='32-WAY-DUP1' where id=61 and name='32_WAY';
update mv_layouts set name='DELETE-ME' where id=62 and name='delete me';
update mv_layouts set name='CLOCK' where id=63 and name='Clock';
update mv_layouts set name='FULL-SCREEN-UMD' where id=64 and name='Full-Screen-UMD';
commit;
