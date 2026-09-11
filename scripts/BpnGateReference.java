package com.fruitfly.brain;
import java.io.*;
import java.nio.file.*;
import java.util.*;

/** Independent full-CNS validation for interrupted/restarted browser input. */
public class BpnGateReference {
 public static void main(String[] args)throws Exception {
  Locale.setDefault(Locale.ROOT);
  Connectome c=Connectome.load(Files.newInputStream(Path.of(args[0])));
  PopulationIndex pi=new PopulationIndex(c); LifConfig cfg=new LifConfig();
  cfg.dtMs=.5;cfg.threads=1;cfg.seed=1;cfg.spikeLogCapacity=0;
  LifNetwork net=new LifNetwork(c,cfg);net.setPostsynapticGain(pi.resolve("prefix:KC"),.25);
  MotorDecoder decoder=new MotorDecoder(pi);
  int[] target=pi.resolve("CL208,CL209,SMP459,SMP460,SMP461");
  double[][] windows={{5000,7000},{8000,8050},{8100,8150},{9000,11000},{11050,12000},{13000,18000}};
  long previous=0;int trainTick=0;boolean wasOn=false;
  try(PrintWriter p=new PrintWriter(args[1])) {
   p.println("time_ms,phase,total_spikes,target_spikes,forward");
   for(int bin=0;bin<460;bin++) {
    double ms=bin*50;boolean on=false;
    for(double[] w:windows)if(ms>=w[0]&&ms<w[1])on=true;
    if(on&&!wasOn)trainTick=0;wasOn=on;
    for(int step=0;step<100;step++) {
     double amp=on&&trainTick%200<10?2:0;
     for(int i:target)net.setInjectedCurrent(i,amp);
     net.step();if(on)trainTick++;
    }
    var out=decoder.update(net,50);long total=net.totalSpikes();
    p.printf("%.0f,%d,%d,%d,%.12f%n",ms+50,on?1:2,total-previous,net.spikesThisTick(target),out.forward);
    previous=total;net.endTick(50);
   }
  }
  System.out.println("Full-CNS interrupted-input reference: "+previous+" spikes.");
 }
}
