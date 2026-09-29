// Synthetic fixtures shared by the unit tests. A tiny hand-computable round:
// 3 players over 6 frames (2 Hz) on Antietam. Carol (CSA) is intentionally
// absent from frame index 3 (t_s 1.5) to exercise the not-sampled sentinel.
//
//   Alice  (USA, officer) [1stTX]
//   Bob    (USA, none)    [1stTX]
//   Carol  (CSA, flag)    [2ndMS]

export const REPLAY_CSV = `map,Antietam
mode,Skirmish
area,The Cornfield
winner,1
round_started_at,14:00:00
sample_rate_hz,2.0
samples,6

t_s,hms,name,team,x,y,z,fwd_x,fwd_y,branch,role_idx,leader_kind,regiment_crc,company
0.0,14:00:00,[1stTX]Colonel_Alice,1,1620,2600,10,1,0,inf,0,officer,tx01,0
0.0,14:00:00,[1stTX]Bob,1,1610,2560,10,1,0,inf,1,none,tx01,0
0.0,14:00:00,[2ndMS]Carol,2,1500,2620,10,-1,0,inf,0,flag,ms02,0
0.5,14:00:00,[1stTX]Colonel_Alice,1,1626,2601,10,1,0,inf,0,officer,tx01,0
0.5,14:00:00,[1stTX]Bob,1,1616,2561,10,1,0,inf,1,none,tx01,0
0.5,14:00:00,[2ndMS]Carol,2,1496,2618,10,-1,0,inf,0,flag,ms02,0
1.0,14:00:01,[1stTX]Colonel_Alice,1,1632,2603,10,1,0,inf,0,officer,tx01,0
1.0,14:00:01,[1stTX]Bob,1,1622,2563,10,1,0,inf,1,none,tx01,0
1.0,14:00:01,[2ndMS]Carol,2,1492,2616,10,-1,0,inf,0,flag,ms02,0
1.5,14:00:01,[1stTX]Colonel_Alice,1,1638,2604,10,1,0,inf,0,officer,tx01,0
1.5,14:00:01,[1stTX]Bob,1,1628,2565,10,1,0,inf,1,none,tx01,0
2.0,14:00:02,[1stTX]Colonel_Alice,1,1644,2606,10,1,0,inf,0,officer,tx01,0
2.0,14:00:02,[1stTX]Bob,1,1634,2567,10,1,0,inf,1,none,tx01,0
2.0,14:00:02,[2ndMS]Carol,2,1488,2614,10,-1,0,inf,0,flag,ms02,0
2.5,14:00:02,[1stTX]Colonel_Alice,1,1650,2608,10,1,0,inf,0,officer,tx01,0
2.5,14:00:02,[1stTX]Bob,1,1640,2569,10,1,0,inf,1,none,tx01,0
2.5,14:00:02,[2ndMS]Carol,2,1484,2612,10,-1,0,inf,0,flag,ms02,0
`;
