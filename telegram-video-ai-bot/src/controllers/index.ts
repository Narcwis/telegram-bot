import { Request, Response } from "express";

export const homeController = (req: Request, res: Response): void => {
  res.send("Welcome to the Telegram Bot Express Server!");
};
