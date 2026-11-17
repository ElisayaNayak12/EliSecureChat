import { Module } from "@nestjs/common";
import { SignVideosController } from "./sign-videos.controller";

@Module({ controllers: [SignVideosController] })
export class SignVideosModule {}
