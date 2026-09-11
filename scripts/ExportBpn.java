package com.fruitfly.brain;
import java.nio.file.*;
import java.io.*;
import java.util.*;

/** Export the induced subgraph of neurons active in the full-CNS 10 Hz benchmark.
 * No anatomical edges or decoder population denominators are invented. */
public class ExportBpn {
 static String q(String s){return "\""+s.replace("\\","\\\\").replace("\"","\\\"")+"\"";}
 public static void main(String[] args)throws Exception {
  Locale.setDefault(Locale.ROOT);
  Connectome c=Connectome.load(Files.newInputStream(Path.of(args[0])));
  PopulationIndex pi=new PopulationIndex(c);
  Set<Long> active=new HashSet<>();
  for(String line:Files.readAllLines(Path.of(args[1])).subList(1,Files.readAllLines(Path.of(args[1])).size())) active.add(Long.parseLong(line.split(",")[0]));
  Set<Integer> inputs=new HashSet<>();for(int i:pi.resolve("CL208,CL209,SMP459,SMP460,SMP461")) inputs.add(i);
  Map<Integer,Integer> ix=new LinkedHashMap<>();for(int i=0;i<c.n;i++) if(active.contains(c.bodyId[i]))ix.put(i,ix.size());
  try(PrintWriter p=new PrintWriter(args[2])) {
   p.println("{\"engineCommit\":\"6cfa30175003ef25da68a237d5eda958f8047b82\",\"graphSha256\":\"e33df182bed7a6f3ea279daf4790a82b05706d3d41e819a6a80c0473e8c559f3\",\"nodes\":[");
   boolean first=true;for(int i:ix.keySet()) {
    if(!first)p.println(",");first=false;
    p.printf("{\"id\":%s,\"type\":%s,\"side\":%s,\"input\":%b,\"motor\":%b,\"position\":[",q(""+c.bodyId[i]),q(c.type(i)),q(c.side(i)),inputs.contains(i),c.superclass(i).contains("motor"));
    for(int j=0;j<3;j++){if(j>0)p.print(",");p.print(Float.isFinite(c.soma[i*3+j])?Float.toString(c.soma[i*3+j]):"null");}p.print("]}");
   }
   p.println("],\"edges\":[");first=true;for(int i:ix.keySet()) for(int k=c.rowPtr[i];k<c.rowPtr[i+1];k++)if(ix.containsKey(c.postIdx[k])){
    if(!first)p.println(",");first=false;p.printf("[%d,%d,%d,%d]",ix.get(i),ix.get(c.postIdx[k]),c.weight[k]&65535,(int)c.ntSign[i]);
   }
   p.print("],\"inputs\":[");first=true;for(int i:ix.keySet())if(inputs.contains(i)){if(!first)p.print(",");first=false;p.print(ix.get(i));}
   p.print("],\"motors\":[],\"forwardTerms\":[");first=true;
   String[] names={"DNp09","DNg100","DNge053","DNge050","DNg97"};double[] weights={.3,.25,.15,.15,.15};
   for(int j=0;j<names.length;j++){
    if(!first)p.print(",");first=false;int[] ids=pi.resolve(names[j]);p.printf("{\"type\":%s,\"weight\":%s,\"populationSize\":%d,\"indices\":[",q(names[j]),weights[j],ids.length);
    boolean fi=true;for(int i:ids)if(ix.containsKey(i)){if(!fi)p.print(",");fi=false;p.print(ix.get(i));}p.print("]}");
   }p.println("]}");
  }
  System.out.println("Exported "+ix.size()+" neurons, "+inputs.size()+" BPN candidates.");
 }
}
