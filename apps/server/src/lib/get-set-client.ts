// Define the structure: An object with msgId keys and Set<string> as values
export type MsgIdMap = { [msgId: string]: Set<string> };

export function addClientId(obj: MsgIdMap, msgId: string, clientId: string): void {
    if (!obj[msgId]) {
        obj[msgId] = new Set();
    }
    obj[msgId].add(clientId);
}

export function removeClientId(obj: MsgIdMap, msgId: string, clientId: string): void {
    if (obj[msgId]) {
        obj[msgId].delete(clientId);
        
        // Optional: Remove the msgId if the Set is empty
        if (obj[msgId].size === 0) {
            delete obj[msgId];
        }
    } else {
        console.log("whole object", msgId)
        console.log(`msgId "${msgId}" does not exist.`);
    }
}

export function processMsgIdMap(obj: MsgIdMap): { [msgId: string]: string } {
  const result: { [msgId: string]: string } = {};
  
  for (const msgId in obj) {
    const clientSet = obj[msgId];
    
    // Only add to result if the set is not empty
    if (clientSet.size > 0) {
      // Get the first client ID from the set
      const firstClientId = Array.from(clientSet)[0];
      result[msgId] = firstClientId;
    }
  }
  
  return result;
}