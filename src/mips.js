#define pc r[32]
#define lo r[33]
#define hi r[34]

// Inline functions for speedup
#define mult(a, b)\
  const res = a * b;\
  \
  lo = res&0xffffffff;\
  hi = (res/power32) | 0

#define div(a, b)\
  if (b) {\
    lo = a / b;\
    hi = a % b;\
  }

#define exception(code, inslot)\
  copr[12] = (copr[12]&0xffffffc0)|((copr[12]<<2)&0x3f);\
  copr[13] = code;\
  copr[14] = pc;\
  \
  pc = 0x80

#define print()\
  if (pc === 0xb0) {\
    if (r[9] === 59 || r[9] === 61) {\
      var char = Chars.fromCharCode(r[4]&0xff).replace(/\n/, '<br/>');\
      output.append(char.toUpperCase());\
    }\
  }

pseudo.CstrR3ka = (function() {
  let r; // Base
  let copr; // Coprocessor
  let opcodeCount;
  let power32; // Cache for expensive calculation
  let output;

  // Base CPU stepper
  function step(inslot) {
    const code = pc>>>20 === 0xbfc ? directMemW(mem._rom.uw, pc) : directMemW(mem._ram.uw, pc);
    opcodeCount++;
    pc  += 4;
    r[0] = 0; // As weird as this seems, it is needed

    switch(opcode) {
      case 0: // SPECIAL
        switch(code&0x3f) {
          case 0: // SLL
            r[rd] = r[rt] << shamt;
            return;

          case 2: // SRL
            r[rd] = r[rt] >>> shamt;
            return;

          case 3: // SRA
            r[rd] = s_ext_w(r[rt]) >> shamt;
            return;

          case 4: // SLLV
            r[rd] = r[rt] << (r[rs]&0x1f);
            return;

          case 6: // SRLV
            r[rd] = r[rt] >>> (r[rs]&0x1f);
            return;

          case 7: // SRAV
            r[rd] = s_ext_w(r[rt]) >> (r[rs]&0x1f);
            return;

          case 8: // JR
            branch(r[rs]);
            print();
            return;

          case 9: // JALR
            r[rd] = pc+4;
            branch(r[rs]);
            return;

          case 12: // SYSCALL
            pc-=4;
            exception(0x20, inslot);
            return;

          case 16: // MFHI
            r[rd] = hi;
            return;

          case 17: // MTHI
            hi = r[rs];
            return;

          case 18: // MFLO
            r[rd] = lo;
            return;

          case 19: // MTLO
            lo = r[rs];
            return;

          case 25: // MULTU
            mult(r[rs], r[rt]);
            return;

          case 26: // DIV
            div(s_ext_w(r[rs]), s_ext_w(r[rt]));
            return;

          case 27: // DIVU
            div(r[rs], r[rt]);
            return;

          case 32: // ADD
            r[rd] = r[rs] + r[rt];
            return;

          case 33: // ADDU
            r[rd] = r[rs] + r[rt];
            return;

          case 35: // SUBU
            r[rd] = r[rs] - r[rt];
            return;

          case 36: // AND
            r[rd] = r[rs] & r[rt];
            return;

          case 37: // OR
            r[rd] = r[rs] | r[rt];
            return;

          case 39: // NOR
            r[rd] = ~(r[rs] | r[rt]);
            return;

          case 42: // SLT
            r[rd] = s_ext_w(r[rs]) < s_ext_w(r[rt]);
            return;

          case 43: // SLTU
            r[rd] = r[rs] < r[rt];
            return;
        }
        psx.error('pseudo / Special CPU instruction -> '+(code&0x3f));
        return;

      case 1: // REGIMM
        switch (rt) {
          case 0: // BLTZ
            if (s_ext_w(r[rs]) < 0) {
              branch(b_addr);
            }
            return;

          case 1: // BGEZ
            if (s_ext_w(r[rs]) >= 0) {
              branch(b_addr);
            }
            return;
        }
        psx.error('pseudo / Bcond CPU instruction -> '+rt);
        return;

      case 2: // J
        branch(s_addr);
        return;

      case 3: // JAL
        r[31] = pc+4;
        branch(s_addr);
        return;

      case 4: // BEQ
        if (r[rs] === r[rt]) {
          branch(b_addr);
        }
        return;

      case 5: // BNE
        if (r[rs] !== r[rt]) {
          branch(b_addr);
        }
        return;

      case 6: // BLEZ
        if (s_ext_w(r[rs]) <= 0) {
          branch(b_addr);
        }
        return;

      case 7: // BGTZ
        if (s_ext_w(r[rs]) > 0) {
          branch(b_addr);
        }
        return;

      case 8: // ADDI
        r[rt] = r[rs] + imm_s;
        return;

      case 9: // ADDIU
        r[rt] = r[rs] + imm_s;
        return;

      case 10: // SLTI
        r[rt] = s_ext_w(r[rs]) < imm_s;
        return;

      case 11: // SLTIU
        r[rt] = r[rs] < imm_u;
        return;

      case 12: // ANDI
        r[rt] = r[rs] & imm_u;
        return;

      case 13: // ORI
        r[rt] = r[rs] | imm_u;
        return;

      case 15: // LUI
        r[rt] = code<<16;
        return;

      case 16: // COP0
        switch (rs) {
          case 0: // MFC0
            r[rt] = copr[rd];
            return;

          case 4: // MTC0
            copr[rd] = r[rt];
            return;

          case 16: // RFE
            copr[12] = (copr[12]&0xfffffff0)|((copr[12]>>>2)&0xf);
            return;
        }
        psx.error('pseudo / Coprocessor 0 CPU instruction -> '+rs);
        return;

      case 32: // LB
        r[rt] = s_ext_b(mem.read.b(ob));
        return;

      case 33: // LH
        r[rt] = s_ext_h(mem.read.h(ob));
        return;

      case 35: // LW
        r[rt] = mem.read.w(ob);
        return;

      case 36: // LBU
        r[rt] = mem.read.b(ob);
        return;

      case 37: // LHU
        r[rt] = mem.read.h(ob);
        return;

      case 40: // SB
        mem.write.b(ob, r[rt]);
        return;

      case 41: // SH
        mem.write.h(ob, r[rt]);
        return;

      case 43: // SW
        mem.write.w(ob, r[rt]);
        return;
    }
    psx.error('pseudo / Basic CPU instruction -> '+opcode);
  }

  function branch(addr) {
    // Execute instruction in slot
    step(true);
    pc = addr;

    // Rootcounters, interrupts
    rootcnt.update();
  }

  // Exposed class functions/variables
  return {
    awake(element) {
         r = new UintWcap(32 + 3); // + pc, lo, hi
      copr = new UintWcap(16);

      // Cache
      power32 = Math.pow(32, 2); // Btw, pure multiplication is faster
      output  = element;
    },

    reset() {
         r.fill(0);
      copr.fill(0);

      copr[12] = 0x10900000;
      copr[15] = 0x2;

      pc = 0xbfc00000;
      opcodeCount = 0;

      // Bootstrap
      //for (let i=0; i<50; i++) { // Benchmark
      const start = performance.now();
      //pc = 0xbfc00000;

      while (pc !== 0x80030000) {
        step(false);
      }
      console.dir('pseudo / Bootstrap completed in '+parseFloat(performance.now()-start).toFixed(2)+' ms');
      //}
    },

    run() {
      for (let i=0; i<350000; i++) {
        step(false);
      }
      requestAnimationFrame(r3ka.run);
    },

    writeOK() {
      return !(copr[12]&0x10000);
    }
  };
})();

#undef pc
#undef lo
#undef hi