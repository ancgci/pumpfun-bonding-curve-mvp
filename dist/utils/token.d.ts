export declare function getTokenBalance(address: any): Promise<{
    name: any;
    symbol: any;
    ca: any;
    balance: any;
}>;
export declare function getTokenHolders(tokenAddress: string): Promise<any>;
export declare function getTokenVolume(tokenAddress: string): Promise<number>;
export declare function getTokenAge(tokenAddress: string): Promise<string>;
