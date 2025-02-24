import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import {
    clusterApiUrl,
    Connection,
    PublicKey,
    Transaction,
    SystemProgram, LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddress, getMint } from "@solana/spl-token";
import BigNumber from "bignumber.js";
import products from "./products.json";

const usdcAddress = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"); // Token address of USDC on devnet
const sellerAddress = "G3ZEAY19iDMjF7P57dgFUZiC4bpeFvMPKShenugL7E2Y"
const sellerPublicKey = new PublicKey(sellerAddress);

const createTransaction = async (req, res) => {
    try {
        // Extract the transaction data from the request body
        const { buyer, orderID, itemID } = req.body;

        // If we don't have something we need, stop
        if (!buyer) {
            res.status(400).json({
                message: "Missing buyer address",
            });
        }
        if (!orderID) {
            res.status(400).json({
                message: "Missing order ID",
            });
        }

        // Fetch item price from products.json using itemID
        const itemPrice = products.find((item) => item.id === itemID).price;

        // Convert price to the correct format
        const bigAmount = BigNumber(itemPrice);
        const buyerPublicKey = new PublicKey(buyer);

        const network = WalletAdapterNetwork.Devnet;
        const endpoint = clusterApiUrl(network);
        const connection = new Connection(endpoint);

        const buyerUsdcAddress = await getAssociatedTokenAddress(usdcAddress, buyerPublicKey);
        const shopUsdcAddress = await getAssociatedTokenAddress(usdcAddress, sellerPublicKey);
        // A blockhash is sort of like an ID for a block. It lets you identify each block.
        const { blockhash } = await connection.getLatestBlockhash("finalized");

        // Get mint address of USDC token
        const usdcMint = await getMint(connection, usdcAddress);
        
        // The first two things nneded - a recent block ID 
        // and the public key of the fee payer 
        const tx = new Transaction({
            recentBlockhash: blockhash,
            feePayer: buyerPublicKey,
        });

        // USDC transfer instruction
        const transferInstruction = createTransferCheckedInstruction(
            buyerUsdcAddress,
            usdcAddress,
            shopUsdcAddress,
            buyerPublicKey,
            bigAmount.toNumber() * 10 ** (await usdcMint).decimals,
            usdcMint.decimals // The token could have any number of decimals
        );

        /// SOL transfer instruction
        // const transferInstruction = SystemProgram.transfer({
        //     fromPubkey: buyerPublicKey,
        //     lamports: bigAmount.multipliedBy(LAMPORTS_PER_SOL).toNumber(), 
        //     toPubkey: sellerPublicKey,
        // });

        // Adding more instructions to the transaction
        transferInstruction.keys.push({
            // Use OrderId to find this transaction later
            pubkey: new PublicKey(orderID), 
            isSigner: false,
            isWritable: false,
        });

        tx.add(transferInstruction);

        // Formatting the transaction
        const serializedTransaction = tx.serialize({
            requireAllSignatures: false,
        });

        const base64 = serializedTransaction.toString("base64");

        res.status(200).json({
            transaction: base64,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({ error: "error creating tx" });
        return;
    }
}

export default function handler(req, res) {
  if (req.method === "POST") {
    createTransaction(req, res);
  } else {
    res.status(405).end();
  }
}